/**
 * 图片本地缓存（统一入口）
 *
 * 原则：**先落盘，再渲染**。任何要进卡片的网络图片都先走这里存到
 * data/PUBG-Helper-Plugin/assetCache/，渲染时用 data URI 内嵌，
 * 不依赖网络（避免裂图 / 每次重拉 / 网络抖动导致出图慢）。
 *
 * 提供三层能力：
 * 1. localImage(url, key)            单张，命中缓存直接返回，签名向后兼容
 * 2. localizeData(data)              深遍历对象/数组，把图片 URL 就地换成 data URI
 * 3. localizeWithNotice(e, data, …)  上面那层 + 「正在存到本地」的提醒（存完自动撤回）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CACHE_DIR = path.resolve('./data/PUBG-Helper-Plugin/assetCache')
const DEFAULT_TIMEOUT = 15000
const DEFAULT_CONCURRENCY = 6

/** 允许识别的图片后缀（URL 里带这些后缀就当作图片） */
const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i
/**
 * 字段名兜底：这些字段就算 URL 没后缀，也当图片处理。
 * 注意 `. +url` 而不是 `.*url` —— 裸 `url` 字段常常是页面链接，不能当图。
 */
const IMG_KEY_RE = /^(icon|.+icon|.+url|avatar|img|image|pic|cover|thumb|banner|logo|qrcode)$/i
/** 明显不是图片的地址（页面 / 脚本 / 文档），字段名再像也不处理 */
const NOT_IMG_RE = /\.(html?|json|js|css|pdf|xml|txt)(\?|#|$)/i
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

export function getCacheDir() {
  return CACHE_DIR
}

/** URL → 缓存文件名（同一个 URL 永远同一个 key，跨功能共享） */
export function keyOfUrl(url) {
  return `img_${crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 20)}.img`
}

function mimeOfKey(key) {
  const ext = String(key).split('.').pop().toLowerCase()
  return MIME_BY_EXT[ext] || ''
}

/** 按文件头猜 mime（缓存 key 没有可用后缀时兜底，避免 jpg/webp 被当 png） */
function sniffMime(buf) {
  if (!buf || buf.length < 12) return ''
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  const head3 = buf.slice(0, 3).toString('latin1')
  if (head3 === 'GIF') return 'image/gif'
  if (buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (head3 === 'BM ') return 'image/bmp'
  if (/^\s*<(\?xml|svg)/i.test(buf.slice(0, 64).toString('utf8'))) return 'image/svg+xml'
  return ''
}

function toDataUri(buf, key) {
  const mime = mimeOfKey(key) || sniffMime(buf) || 'image/png'
  return `data:${mime};base64,` + buf.toString('base64')
}

/** 读取已缓存文件（没有返回 null） */
function readCacheFile(file) {
  try {
    const buf = fs.readFileSync(file)
    return buf.length ? buf : null
  } catch {
    return null
  }
}

function isRemoteImage(u) {
  return typeof u === 'string' && u.length < 2048 && /^https?:\/\//i.test(u)
}

/** 下载一张图，返回 { buf, ext } 或 null */
async function fetchImage(url, timeout = DEFAULT_TIMEOUT) {
  let timer = null
  try {
    const ctrl = new AbortController()
    timer = setTimeout(() => ctrl.abort(), timeout)
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res || !res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null
    const ct = String(res.headers?.get?.('content-type') || '').toLowerCase()
    let ext = 'png'
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg'
    else if (ct.includes('webp')) ext = 'webp'
    else if (ct.includes('gif')) ext = 'gif'
    else if (ct.includes('svg')) ext = 'svg'
    else if (ct.includes('bmp')) ext = 'bmp'
    else {
      const m = String(url).match(IMG_EXT_RE)
      if (m) ext = m[1].toLowerCase().replace('jpeg', 'jpg')
    }
    return { buf, ext }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 单张图片本地化（向后兼容的入口）
 * @param url  远程图片地址
 * @param key  缓存文件名；不传则用 URL 的 hash
 * @returns data URI；下载失败返回 ''
 */
export async function localImage(url, key, { timeout = DEFAULT_TIMEOUT } = {}) {
  if (!isRemoteImage(url)) return ''
  ensureDir()
  const file = path.join(CACHE_DIR, key || keyOfUrl(url))
  const hit = readCacheFile(file)
  if (hit) return toDataUri(hit, key || file)
  const got = await fetchImage(url, timeout)
  if (!got) return ''
  // 统一用 URL hash 命名，命中判断和落盘用同一个 key，避免「存了但下次又下」
  const finalKey = key || keyOfUrl(url)
  try {
    fs.writeFileSync(path.join(CACHE_DIR, finalKey), got.buf)
  } catch { /* 落盘失败也照样返回图，下次再存 */ }
  return toDataUri(got.buf, finalKey || got.ext)
}

/** 命中缓存就直接拿 data URI（不联网），否则返回 ''。给「先探测再下载」的场景用 */
export function cachedImage(url, key) {
  if (!isRemoteImage(url)) return ''
  const file = path.join(CACHE_DIR, key || keyOfUrl(url))
  const hit = readCacheFile(file)
  return hit ? toDataUri(hit, key || file) : ''
}

/** 已经拿到 Buffer 的场景（比如探测时就下好了）：落盘后返回 data URI */
export function saveBufferImage(url, buf, key) {
  if (!buf || !buf.length) return ''
  const finalKey = key || (isRemoteImage(url) ? keyOfUrl(url) : `buf_${Date.now()}.img`)
  try {
    ensureDir()
    const file = path.join(CACHE_DIR, finalKey)
    if (!readCacheFile(file)) fs.writeFileSync(file, buf)
  } catch { /* 落盘失败也返回图 */ }
  return toDataUri(buf, finalKey)
}

/** 是否已缓存 */
export function hasCached(url, key) {
  if (!isRemoteImage(url)) return false
  try {
    return fs.statSync(path.join(CACHE_DIR, key || keyOfUrl(url))).size > 0
  } catch {
    return false
  }
}

/**
 * 收集对象里所有「像图片」的远程地址（不修改数据）
 * @returns [{ owner, field, url }]
 */
export function collectImages(data, { maxDepth = 8 } = {}) {
  const hits = []
  const seen = new Set()
  const walk = (node, fieldName, depth) => {
    if (depth > maxDepth || node == null) return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], fieldName, depth + 1)
      return
    }
    if (typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k], k, depth + 1)
      return
    }
    if (typeof node !== 'string' || !isRemoteImage(node)) return
    if (seen.has(node)) return
    if (NOT_IMG_RE.test(node)) return
    const isImg = IMG_EXT_RE.test(node) || (fieldName && IMG_KEY_RE.test(fieldName))
    if (!isImg) return
    seen.add(node)
    hits.push({ url: node })
  }
  walk(data, '', 0)
  return hits
}

/**
 * 批量把 URL 存到本地，返回 Map<url, dataUri>
 * @param urls   远程地址数组（自动去重）
 * @param opts.concurrency 并发数
 * @param opts.onProgress  (done, total) => void
 * @param opts.keyOf       (url) => 缓存 key，默认 URL hash
 */
export async function cacheUrls(urls, { concurrency = DEFAULT_CONCURRENCY, onProgress, keyOf, timeout = DEFAULT_TIMEOUT } = {}) {
  const unique = [...new Set((urls || []).filter(isRemoteImage))]
  const result = new Map()
  const stats = { total: unique.length, cached: 0, fetched: 0, failed: 0 }
  if (!unique.length) return { map: result, stats }

  ensureDir()
  const todo = []
  for (const url of unique) {
    const key = keyOf ? keyOf(url) : null
    const uri = cachedImage(url, key)
    if (uri) {
      result.set(url, uri)
      stats.cached++
    } else {
      todo.push({ url, key })
    }
  }

  let done = stats.cached
  if (stats.cached) onProgress?.(done, stats.total)

  let cursor = 0
  const worker = async () => {
    while (cursor < todo.length) {
      const { url, key } = todo[cursor++]
      const uri = await localImage(url, key, { timeout })
      if (uri) {
        result.set(url, uri)
        stats.fetched++
      } else {
        stats.failed++
      }
      done++
      onProgress?.(done, stats.total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker))
  return { map: result, stats }
}

/**
 * 深遍历数据，把图片 URL 就地替换成 data URI（先存本地，再返回）
 * @returns {{ total, cached, fetched, failed }}
 */
export async function localizeData(data, opts = {}) {
  const hits = collectImages(data, opts)
  if (!hits.length) return { total: 0, cached: 0, fetched: 0, failed: 0 }
  const { map, stats } = await cacheUrls(hits.map((h) => h.url), opts)
  // 再遍历一次替换（统一替换，避免漏掉同一个 URL 的多处引用）
  const replace = (node, depth) => {
    if (depth > (opts.maxDepth || 8) || node == null) return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string' && map.has(node[i])) node[i] = map.get(node[i])
        else replace(node[i], depth + 1)
      }
      return
    }
    if (typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (typeof node[k] === 'string' && map.has(node[k])) node[k] = map.get(node[k])
        else replace(node[k], depth + 1)
      }
    }
  }
  replace(data, 0)
  return stats
}

/** 发「正在存图」提醒，返回 message_id（群禁言/发送失败返回 null） */
async function notifyStart(e, { need, total, cached, label }) {
  const parts = [`⏳ 正在把 ${need} 张${label ? label + '图' : '图片'}存到本地`]
  parts.push(cached ? `（共 ${total} 张，已缓存 ${cached} 张）` : `（共 ${total} 张）`)
  parts.push('，存好就出图…')
  const msg = parts.join('')
  try {
    // 兜底 3 分钟自动撤回，正常会在渲染完成后主动撤回
    const res = await e.reply(msg, false, { recallMsg: 180 })
    return res && res.message_id ? res.message_id : null
  } catch {
    return null
  }
}

async function recallNotice(e, messageId) {
  if (!messageId) return
  try {
    if (e.group?.recallMsg) await e.group.recallMsg(messageId)
    else if (e.friend?.recallMsg) await e.friend.recallMsg(messageId)
  } catch { /* 撤回失败就等自动撤回 */ }
}

/**
 * 「提醒 → 存本地 → 撤回提醒」一条龙，卡片类指令在出图前调这一句就够
 * @param e     消息事件
 * @param data  要渲染的数据（会被就地改写）
 * @param label 卡片名，仅用于提醒文案，如 '资产' / '主页'
 */
export async function localizeWithNotice(e, data, label, opts = {}) {
  const hits = collectImages(data, opts)
  if (!hits.length) return { total: 0, cached: 0, fetched: 0, failed: 0 }
  const need = hits.filter((h) => !cachedImage(h.url, opts.keyOf ? opts.keyOf(h.url) : null)).length
  let msgId = null
  if (need > 0) msgId = await notifyStart(e, { need, total: hits.length, cached: hits.length - need, label })
  try {
    return await localizeData(data, { ...opts, onProgress: opts.onProgress })
  } finally {
    await recallNotice(e, msgId)
  }
}

/**
 * 按字段批量缓存（资产这类「一页一页的物品」用）
 * @param items       对象数组
 * @param urlField    源字段，默认 imageUrl
 * @param targetField 目标字段，默认 localImg
 * @param keyOf       (item) => 缓存 key（如 item_123.png）
 */
export async function cacheItems(items, {
  urlField = 'imageUrl',
  targetField = 'localImg',
  keyOf,
  concurrency = DEFAULT_CONCURRENCY,
  onProgress,
  timeout = DEFAULT_TIMEOUT,
} = {}) {
  // 只挑「字段还是远程地址」的项：已经换成 data URI 的天然被 isRemoteImage 过滤掉
  const todo = (items || []).filter((it) => it && isRemoteImage(it[urlField]))
  const stats = { total: todo.length, cached: 0, fetched: 0, failed: 0 }
  if (!todo.length) return stats

  ensureDir()
  const queue = []
  for (const it of todo) {
    const key = keyOf ? keyOf(it) : null
    const uri = cachedImage(it[urlField], key)
    if (uri) {
      it[targetField] = uri
      stats.cached++
    } else {
      queue.push({ it, key })
    }
  }
  let done = stats.cached
  if (stats.cached) onProgress?.(done, stats.total)

  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const { it, key } = queue[cursor++]
      const uri = await localImage(it[urlField], key, { timeout })
      if (uri) {
        it[targetField] = uri
        stats.fetched++
      } else {
        stats.failed++
      }
      done++
      onProgress?.(done, stats.total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return stats
}

/** 上面那批里还有几张没缓存（用于决定要不要提醒） */
export function countItemsMissing(items, { urlField = 'imageUrl', targetField = 'localImg', keyOf } = {}) {
  const todo = (items || []).filter((it) => it && isRemoteImage(it[urlField]))
  const missing = todo.filter((it) => !cachedImage(it[urlField], keyOf ? keyOf(it) : null)).length
  return { total: todo.length, missing }
}

/**
 * cacheItems 的「带提醒」版本：需要下载才提醒，存完自动撤回
 */
export async function cacheItemsWithNotice(e, items, label, opts = {}) {
  const { total, missing } = countItemsMissing(items, opts)
  if (!total) return { total: 0, cached: 0, fetched: 0, failed: 0 }
  let msgId = null
  if (missing > 0) msgId = await notifyStart(e, { need: missing, total, cached: total - missing, label })
  try {
    return await cacheItems(items, opts)
  } finally {
    await recallNotice(e, msgId)
  }
}

export default {
  localImage, cachedImage, saveBufferImage, hasCached, collectImages, cacheUrls, localizeData,
  localizeWithNotice, cacheItems, cacheItemsWithNotice, countItemsMissing, keyOfUrl, getCacheDir,
}
