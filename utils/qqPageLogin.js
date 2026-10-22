// 和平营地 QQ 扫码登录（页面式授权）
// 链路：puppeteer 打开 openmobile.qq.com m_authorize(token) → 页面出码 → 扫码
//   → 拦截 auth:// 回调（access_token/pay_token）→ graph/me 换 openid
//   → 营地 /user/login(qqconnect) 换凭证（请求体无需 uin）
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { campLoginByQq } from './qqCampLogin.js'

const DEBUG_FILE = path.join(process.cwd(), 'data', 'PUBG-Helper-Plugin', 'qqLogin-debug.log')

/** 追加调试日志 */
function debugLog(lines) {
  try {
    fs.appendFileSync(DEBUG_FILE, `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${lines}\n`, 'utf8')
  } catch { /* 忽略 */ }
}

const CAMP_QQ_APPID = '1105412664'
const LOGIN_PAGE = `https://openmobile.qq.com/oauth2.0/m_authorize?client_id=${CAMP_QQ_APPID}&scope=all&redirect_uri=${encodeURIComponent('auth://tauth.qq.com/')}&response_type=token&style=qr`
// 扫码页在手机 UA 下才给二维码版式
const QR_UA = 'Mozilla/5.0 (Linux; Android 15; V2366GA Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.154 Safari/537.36 tencent_game_emulator'
const PAGE_TIMEOUT_MS = 90 * 1000
const QR_WAIT_TIMEOUT_MS = 60 * 1000
const SCAN_TIMEOUT_MS = 3 * 60 * 1000

/**
 * 解析授权回调 URL 的 access_token/pay_token（QQ 的 auth:// 回调不含 openid/uin，openid 用 graph 换）。
 */
export function parseCallback(url) {
  if (!url) return null
  const hash = url.includes('#') ? url.split('#').slice(1).join('#') : (url.split('?')[1] || '')
  const p = Object.fromEntries(new URLSearchParams(hash))
  const at = p.access_token || p.accessToken || ''
  if (!at) return null
  return {
    access_token: at,
    pay_token: p.pay_token || p.payToken || '',
  }
}

/** 用 access_token 换 openid（QQ OAuth 标准） */
async function fetchOpenid(accessToken) {
  const res = await fetch(
    'https://graph.qq.com/oauth2.0/me?access_token=' + encodeURIComponent(accessToken) + '&fmt=json',
    { headers: { 'User-Agent': QR_UA }, signal: AbortSignal.timeout(15000) }
  )
  const text = await res.text().catch(() => '')
  const json = JSON.parse(text || 'null')
  if (json?.openid) return String(json.openid)
  debugLog('graph/me 未返回 openid: ' + text.slice(0, 200))
  return ''
}

/** 扫码成功后补 openid（回调本身不含） */
async function resolveCompleteCredentials(cb) {
  const openid = await fetchOpenid(cb.access_token)
  debugLog('凭证补全: openid=' + (openid ? openid.slice(0, 8) + '...' : '(空)'))
  return { ...cb, openid }
}

function resolveRenderer(e) {
  for (const candidate of [e?.runtime?.puppeteer, puppeteer]) {
    if (candidate && typeof candidate.browserInit === 'function') return candidate
  }
  return null
}

/** 兜底：自己起一个浏览器（宿主渲染后端不是 puppeteer 时） */
async function launchOwnBrowser() {
  let puppeteerPkg = null
  try {
    puppeteerPkg = (await import('puppeteer')).default
  } catch (error) {
    debugLog('自启浏览器失败（未安装 puppeteer 包）: ' + error.message)
    return null
  }
  return await puppeteerPkg
    .launch({
      headless: 'new',
      args: ['--disable-gpu', '--disable-setuid-sandbox', '--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
      timeout: 60 * 1000,
    })
    .catch((error) => {
      debugLog('自启浏览器失败: ' + error.message)
      return null
    })
}

async function acquireBrowser(renderer, { retries = 4, intervalMs = 700 } = {}) {
  if (renderer) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const browser = await renderer.browserInit().catch((error) => {
        debugLog('宿主浏览器初始化失败: ' + error.message)
        return null
      })
      if (browser) return { browser, owned: false }
      if (attempt < retries) await sleep(intervalMs)
    }
    debugLog('宿主浏览器多次获取失败，改为自己启动')
  }
  const browser = await launchOwnBrowser()
  return browser ? { browser, owned: true } : null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 创建 QQ 登录会话：开页面出码，返回二维码 + waitForCallback + close。
 * @param {object} e 消息事件（取宿主渲染器）
 */
export async function createQQLoginSession(e) {
  const renderer = resolveRenderer(e)
  const acquired = await acquireBrowser(renderer)
  if (!acquired) throw new Error('浏览器不可用，无法发起 QQ 扫码登录')
  const { browser, owned: ownBrowser } = acquired

  let page
  try {
    page = await browser.newPage()
  } catch (error) {
    if (ownBrowser) { try { await browser.close() } catch {} }
    debugLog('创建页面失败: ' + error.message)
    throw new Error('浏览器页面创建失败，请稍后重试')
  }

  let closed = false
  let callbackValue = null
  let callbackResolve = null
  const callbackPromise = new Promise((resolve) => { callbackResolve = resolve })

  const close = async () => {
    if (closed) return
    closed = true
    try { await page.close() } catch {}
    if (ownBrowser) {
      try { await browser.close() } catch {}
    }
  }

  try {
    await page.setUserAgent(QR_UA)
    await page.setViewport({ width: 420, height: 760, isMobile: true })

    // 拦截 auth:// 回调（response_type=token 时凭证在 fragment，# 后）
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith('auth://') && !url.includes('tauth.qq.com')) return
      debugLog('拦截到授权回调请求: ' + url.slice(0, 220))
      const t = parseCallback(url)
      if (t && !callbackValue) {
        callbackValue = t
        debugLog('回调解析成功: access_token=' + t.access_token.slice(0, 8) + '...')
        callbackResolve?.(t)
      } else {
        debugLog('回调 URL 无 access_token（fragment: ' + (url.split('#').slice(1).join('#') || '(空)').slice(0, 120) + '）')
      }
    })

    debugLog('打开授权页: ' + LOGIN_PAGE.replace(/client_id=\d+/, 'client_id=***'))
    try {
      await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
    } catch (error) {
      debugLog('打开登录页失败: ' + error.message)
      throw new Error('打开 QQ 登录页失败，请稍后重试')
    }

    // 等二维码渲染出来
    const deadline = Date.now() + QR_WAIT_TIMEOUT_MS
    let box = null
    while (Date.now() < deadline) {
      box = await page
        .evaluate(() => {
          const selectors = [
            '#qrlogin_img', '.qrlogin_img', 'img[src*="ptqrshow"]',
            'img[src*="qrcode"]', 'canvas#qrlogin_canvas', '.qrlogin canvas',
          ]
          for (const selector of selectors) {
            const el = document.querySelector(selector)
            if (el) {
              const rect = el.getBoundingClientRect()
              if (rect.width > 40 && rect.height > 40) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
          }
          return null
        })
        .catch(() => null)
      if (box) break
      await sleep(800)
    }
    if (!box) throw new Error('未能获取登录二维码，请稍后重试')

    // 页面内读二维码（base64），失败再截图
    let qrcodeBuffer = await page
      .evaluate(async () => {
        const el = document.querySelector('#qrlogin_img, .qrlogin_img, img[src*="ptqrshow"], img[src*="qrcode"], canvas#qrlogin_canvas, .qrlogin canvas')
        if (!el) return null
        try {
          if (el.tagName === 'CANVAS') return el.toDataURL('image/png')
          const src = el.currentSrc || el.src || el.getAttribute('data-src')
          if (!src) return null
          const response = await fetch(src, { credentials: 'include' })
          const blob = await response.blob()
          return await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch { return null }
      })
      .catch(() => null)

    if (typeof qrcodeBuffer === 'string' && qrcodeBuffer.startsWith('data:')) {
      qrcodeBuffer = Buffer.from(qrcodeBuffer.slice(qrcodeBuffer.indexOf(',') + 1), 'base64')
    } else {
      qrcodeBuffer = await page
        .screenshot({
          clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 },
        })
        .catch(async (error) => {
          debugLog('二维码区域截图失败，改用整页截图: ' + error.message)
          return page.screenshot().catch(() => null)
        })
    }
    if (!qrcodeBuffer) throw new Error('二维码截图失败，请稍后重试')

    // 等待扫码 + 授权回调；附带"已扫码"提示
    const waitForCallback = async ({ timeoutMs = SCAN_TIMEOUT_MS, onStatusChange } = {}) => {
      const began = Date.now()
      let scannedNotified = false
      while (Date.now() - began < timeoutMs) {
        if (callbackValue) return callbackValue
        if (closed) {
          const err = new Error('登录会话已结束')
          err.code = 'QR_CANCELED'
          throw err
        }
        // 已扫码提示（页面文案）
        if (!scannedNotified && typeof onStatusChange === 'function') {
          const scanned = await page
            .evaluate(() => /扫码成功|请在手机上确认|已扫码|确认登录/.test(document.body?.innerText || ''))
            .catch(() => false)
          if (scanned) {
            scannedNotified = true
            void onStatusChange({ statusCode: 404 })
          }
        }
        // 双保险：页面 location.href 轮询（auth:// 导航可能不触发 request 拦截）
        const href = await page.evaluate(() => location.href).catch(() => '')
        if (href && (href.startsWith('auth://') || href.includes('tauth.qq.com'))) {
          const t = parseCallback(href)
          if (t && !callbackValue) {
            callbackValue = t
            debugLog('location.href 轮询解析成功: access_token=' + t.access_token.slice(0, 8) + '...')
            callbackResolve?.(t)
            return t
          }
        }
        const waitResult = await Promise.race([callbackPromise.then(() => 'cb'), sleep(1200).then(() => 'tick')])
        if (waitResult === 'cb') return callbackValue
      }
      const err = new Error(scannedNotified ? '登录等待超时（请在手机上确认登录）' : '登录二维码已过期，请重新发起')
      err.code = 'QR_TIMEOUT'
      throw err
    }

    return { browser, page, qrcodeBuffer, waitForCallback, close }
  } catch (error) {
    await close()
    throw error
  }
}

/**
 * 完整登录流程：等扫码 → 回调凭证（补 openid）→ 营地登录，返回营地账号数据。
 * @param {object} options { onStatusChange }
 */
export async function waitForQQLogin(session, options = {}) {
  const { onStatusChange } = options
  const raw = await session.waitForCallback({ onStatusChange })
  const cb = await resolveCompleteCredentials(raw)
  if (!cb.openid) throw new Error('授权回调缺少 openid（graph/me 换取失败）')
  debugLog('开始营地登录')
  const camp = await campLoginByQq(cb)
  debugLog('营地登录成功 userId=' + camp.userId + ' uin=' + camp.uin)
  return camp
}
