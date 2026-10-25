/**
 * 图片本地缓存（小工具）
 *
 * 首次下载落盘到 data/PUBG-Helper-Plugin/assetCache/，之后转 base64 内嵌，
 * 渲染时完全不依赖网络（避免裂图 / 加载慢）。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CACHE_DIR = path.resolve('./data/PUBG-Helper-Plugin/assetCache')

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

/** 返回 data URI；下载失败返回 '' */
export async function localImage(url, key) {
  if (!url || !/^https?:\/\//.test(String(url))) return ''
  ensureDir()
  const file = path.join(CACHE_DIR, key || crypto.createHash('md5').update(url).digest('hex') + '.img')
  try {
    const buf = fs.readFileSync(file)
    if (buf.length > 0) return 'data:image/png;base64,' + buf.toString('base64')
  } catch { /* 未缓存，走下载 */ }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return ''
    fs.writeFileSync(file, buf)
    return 'data:image/png;base64,' + buf.toString('base64')
  } catch {
    return ''
  }
}

export default { localImage }
