// 和平营地登录（QQ connect）
// 请求体 = UserLoginScene 场景字段 + NetworkCommonHandler 公共参数（缺公共参数会 -20011）
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DEBUG_FILE = path.join(process.cwd(), 'data', 'PUBG-Helper-Plugin', 'qqLogin-debug.log')

/** 追加调试日志 */
function debugLog(lines) {
  try {
    fs.appendFileSync(DEBUG_FILE, `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${lines}\n`, 'utf8')
  } catch { /* 忽略写日志失败 */ }
}

const CAMP_APPID = '1105412664'
const REQUEST_TIMEOUT_MS = 15000

/** 营地登录（qqconnect，JSON body = 场景参数 + 公共参数） */
export async function campLoginByQq({ access_token, openid, pay_token }) {
  const body = {
    appId: CAMP_APPID,
    loginType: 'qqconnect',
    autoLogin: 1,
    appOpenid: openid,
    accessToken: access_token,
    payToken: pay_token || '',
    lastLoginTime: 0,
    lastGetRemarkTime: 0,
    // ---- NetworkCommonHandler 公共参数（每个请求必带）----
    cDeviceId: randomUUID().replace(/-/g, ''),
    cDeviceMac: '02:00:00:00:00:00',
    cDevicePPI: 480,
    cDeviceScreenWidth: 1080,
    cDeviceScreenHeight: 2400,
    cDeviceModel: 'Pixel 7',
    cDeviceRom: 'android',
    cDeviceMem: 8589934592,
    cDeviceCPU: 'qcom',
    cDeviceSP: 'China Mobile',
    cDeviceNet: 'WIFI',
    cClientVersionCode: 2102091536,
    cClientVersionName: '3.38.3.1625',
    cChannelId: 10003391,
    cGameId: 20004,
    cSystem: 'android',
    cSystemVersionCode: '34',
    cSystemVersionName: '14',
    cStartType: 0,
    gameAppId: 20004,
    cCurrentGameId: 20004,
    platId: 1,
    openId: openid,
    cRand: String(Date.now()) + String(Math.floor(Math.random() * 10000)),
    cPlanId: 0,
    isColdStart: 0,
    isChange: 0,
  }
  debugLog('营地登录 POST /user/login body: ' + JSON.stringify({ ...body, accessToken: body.accessToken.slice(0, 6) + '...', appOpenid: body.appOpenid.slice(0, 8) + '...', payToken: body.payToken.slice(0, 6) + '...' }).slice(0, 500))
  const res = await fetch('https://formal.api.gp.qq.com/user/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36',
      Origin: 'https://gp.qq.com',
      Referer: 'https://gp.qq.com/',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text().catch(() => '')
  debugLog('营地登录响应: status=' + res.status + ' ' + text.slice(0, 300))
  const json = JSON.parse(text || 'null')
  if (!json || json.returnCode !== 0 || !json.data?.userId || !json.data?.token) {
    throw new Error(json?.returnMsg || (json?.returnCode !== undefined ? 'code=' + json.returnCode : `营地登录失败（${res.status}）`))
  }
  const d = json.data
  return {
    userId: String(d.userId || ''),
    token: String(d.token || ''),
    openId: String(d.appOpenid || openid),
    gameOpenId: String(d.appOpenid || openid),
    uin: String(d.uin || ''),
    userName: String(d.userName || ''),
    avatar: String(d.avatar || ''),
    userSig: String(d.userSig || ''),
  }
}
