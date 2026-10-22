// 和平营地 微信扫码登录核心模块
// 逆向来源: com.tencent.gamehelper.pg 3.38.3.1625 (WXQRLoginActivity + diffdev SDK)
// versionCode: 2102091536 (应用宝 2026.9.16 构建)
// 链路:
//   1. GET  /user/getwxsdkticket                -> sdkTicket
//   2. GET  open.weixin.qq.com/connect/sdk/qrconnect  -> 二维码 base64 + uuid (微信官方扫码SDK, 无redirect_uri限制)
//   3. GET  long.open.weixin.qq.com/connect/l/qrconnect?f=json&uuid= -> 轮询扫码状态 (405=拿到authCode)
//   4. POST /user/login (loginType=wx&code=...)  -> userId/token/userSig/uin/userName/avatar/serverIndex
import crypto from 'node:crypto'
import fetch from 'node-fetch'

const APPID_WX = 'wxb7659468ecf2f4ce'
const CAMP_BASE = 'https://formal.api.gp.qq.com'
const WX_QR_URL = 'https://open.weixin.qq.com/connect/sdk/qrconnect'
const WX_POLL_URL = 'https://long.open.weixin.qq.com/connect/l/qrconnect'
const DEFAULT_PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0h62mV/zjJtFsNdfFNlxksfUOpjDI2KCcBrPiA8T7szABT4InLDTrdXAW84QyGNiazB0i7pgPCNGSAYbiJrCRutZ5jQsVS0Wg/RnXfwVQDJcAHJDjP5IXyroeLX7NUxDai8nPcpfRsvq6sneobyPexZSH0TlVSnecsJZTj5wu/wIDAQAB'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sha1(input) {
  return crypto.createHash('sha1').update(input).digest('hex')
}

function buildPublicKeyPem(publicKey) {
  const chunks = publicKey.match(/.{1,64}/g) || [publicKey]
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----`
}

function rsaEncryptChunked(buffer, publicKey) {
  const chunks = []
  for (let offset = 0; offset < buffer.length; offset += 117) {
    chunks.push(crypto.publicEncrypt(
      { key: buildPublicKeyPem(publicKey), padding: crypto.constants.RSA_PKCS1_PADDING },
      buffer.subarray(offset, offset + 117)
    ))
  }
  return Buffer.concat(chunks)
}

// 设备指纹(可伪造, 来自 NetworkCommonHandler + 营地APP默认值)
function buildSpecialEncodeParam(publicKey = DEFAULT_PUBLIC_KEY) {
  const timestamp = Date.now()
  const deviceId = crypto.randomUUID().replace(/-/g, '')
  const payload = {
    timestamp,
    nonce: `:${crypto.randomUUID().replace(/-/g, '')}:${timestamp}`,
    cDeviceId: deviceId,
    deviceid: deviceId,
    cDeviceImei: deviceId.slice(0, 15),
    cDeviceMac: '02:00:00:00:00:00',
    cDevicePPI: 480,
    cDeviceScreenWidth: 1080,
    cDeviceScreenHeight: 2400,
    cDeviceBrand: 'OnePlus',
    cDeviceModel: 'PHK110',
    cDeviceMem: 12 * 1024 * 1024 * 1024,
    cDeviceCPU: 'SM8650',
    cSystemVersionCode: '34',
    cDeviceNet: 'WIFI',
    cDeviceSP: 'China Mobile',
    cDeviceOaid: deviceId,
    deviceLevel: 3,
    px: 0,
    py: 0,
    wifi_ssid: 'unknown',
    wifi_mac: '02:00:00:00:00:00'
  }
  return rsaEncryptChunked(Buffer.from(JSON.stringify(payload), 'utf8'), publicKey).toString('base64')
}

// 1. 获取 sdkTicket
async function fetchSdkTicket() {
  const res = await fetch(`${CAMP_BASE}/user/getwxsdkticket`, {
    headers: { 'User-Agent': 'okhttp/4.9.1', 'X-Client-Proto': 'https', NOENCRYPT: '1' }
  })
  const json = await res.json()
  if (!res.ok || json.returnCode !== 0 || !json.data) {
    throw new Error(`获取sdkTicket失败: ${JSON.stringify(json)}`)
  }
  return json.data
}

// 2. 生成微信扫码二维码
async function fetchWxQrCode(ticket) {
  const ms = String(Date.now())
  const signature = sha1(`appid=${APPID_WX}&noncestr=${ms}&sdk_ticket=${ticket}&timestamp=${ms}`)
  const url = new URL(WX_QR_URL)
  url.searchParams.set('appid', APPID_WX)
  url.searchParams.set('noncestr', ms)
  url.searchParams.set('timestamp', ms)
  url.searchParams.set('scope', 'snsapi_userinfo')
  url.searchParams.set('signature', signature)

  const res = await fetch(url.toString())
  const json = await res.json()
  if (!res.ok || json.errcode !== 0 || !json.qrcode?.qrcodebase64 || !json.uuid) {
    throw new Error(`获取二维码失败: ${JSON.stringify(json)}`)
  }
  return {
    uuid: json.uuid,
    appName: json.appname || '和平营地',
    qrcodeBase64: json.qrcode.qrcodebase64
  }
}

// 3. 轮询扫码状态
async function pollWxQr(uuid) {
  const url = new URL(WX_POLL_URL)
  url.searchParams.set('f', 'json')
  url.searchParams.set('uuid', uuid)
  const res = await fetch(url.toString(), { timeout: 15000 })
  return res.json()
}

// 4. 用 authCode 登录营地
async function campLoginWithWxCode(authCode) {
  const form = new URLSearchParams({
    loginType: 'wx',
    code: authCode,
    autoLogin: '1',
    lastLoginTime: '0',
    lastGetRemarkTime: '0',
    appId: '1105412664',
    cClientVersionCode: '2102091536',
    cClientVersionName: '3.38.3.1625',
    cCurrentGameId: '20004',
    cGameId: '20004',
    cSystem: 'android',
    cSystemVersionCode: '34',
    cSystemVersionName: '14',
    cRand: String(Date.now()),
    cChannelId: '10003391',
    cIsArm64: 'true',
    cSupportArm64: 'true',
    cGzip: '1',
    specialEncodeParam: buildSpecialEncodeParam()
  })
  const res = await fetch(`${CAMP_BASE}/user/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'okhttp/4.9.1',
      'X-Client-Proto': 'https',
      NOENCRYPT: '1'
    },
    body: form.toString(),
    timeout: 20000
  })
  return res.json()
}

// 登录响应 -> 插件凭证(camp)
function buildCampFromLogin(data) {
  return {
    userId: String(data.userId || ''),
    token: String(data.token || ''),
    userSig: String(data.userSig || ''),
    uin: String(data.uin || ''),
    userName: String(data.userName || ''),
    nickname: String(data.nickname || data.userName || ''),
    avatar: String(data.avatar || ''),
    serverIndex: Number(data.serverIndex || 0),
    openId: String(data.appOpenid || data.openId || data.uin || ''),
    gameOpenId: String(data.gameOpenId || data.openId || data.uin || ''),
    seasonId: '0',
    loginPlatform: 'wechat'
  }
}

// 创建扫码会话: 拿 ticket + 二维码
export async function createWxLoginSession() {
  const ticket = await fetchSdkTicket()
  const qr = await fetchWxQrCode(ticket)
  return {
    ticket,
    uuid: qr.uuid,
    appName: qr.appName,
    qrcodeBase64: qr.qrcodeBase64,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3 * 60 * 1000
  }
}

// 等待扫码结果: 成功返回账号凭证, 失败抛错
export async function waitForWxLogin(session, options = {}) {
  const { timeoutMs = 3 * 60 * 1000, pollIntervalMs = 2000, onStatusChange = null } = options
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    let pollResult
    try {
      pollResult = await pollWxQr(session.uuid)
    } catch (e) {
      if (typeof onStatusChange === 'function') onStatusChange({ error: e.message })
      await sleep(pollIntervalMs)
      continue
    }
    const statusCode = pollResult.wx_errcode ?? pollResult.errcode ?? null
    const authCode = pollResult.wx_code ?? pollResult.code ?? null

    if (typeof onStatusChange === 'function') {
      onStatusChange({ statusCode, authCode, raw: pollResult })
    }

    if (authCode && statusCode === 405) {
      const login = await campLoginWithWxCode(authCode)
      if (login.result !== 0 || !login.data || !login.data.userId) {
        const err = new Error(login.returnMsg || ('营地登录失败 code=' + login.returnCode))
        err.code = 'CAMP_LOGIN_FAIL'
        throw err
      }
      return buildCampFromLogin(login.data)
    }
    if (statusCode === 402) {
      const err = new Error('二维码已过期，请重新发起 #和平微信登录')
      err.code = 'QR_EXPIRED'
      throw err
    }
    if (statusCode === 403) {
      const err = new Error('扫码已取消')
      err.code = 'QR_CANCELED'
      throw err
    }
    if (statusCode === 500) {
      const err = new Error('微信登录服务异常，请稍后重试')
      err.code = 'QR_ERROR'
      throw err
    }
    await sleep(pollIntervalMs)
  }

  const err = new Error('等待扫码超时(3分钟)，请重新发起 #和平微信登录')
  err.code = 'QR_TIMEOUT'
  throw err
}
