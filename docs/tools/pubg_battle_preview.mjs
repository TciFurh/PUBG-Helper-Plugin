/**
 * 和平插件战绩页预览脚本（开发用，不属于插件本体）
 *
 * 用途：改 battlelist.html / battledetail.html 后，用真实营地数据渲染成 PNG 做视觉校验，
 *      不用重启机器人，也不依赖机器人框架。
 *
 * 用法（任意目录执行均可，脚本内部自己定位 D:\jiuli）：
 *   "D:/Code/nodejs/node.exe" "C:/Users/小游/WorkBuddy/2026-10-23-03-18-24/scripts/pubg_battle_preview.mjs"
 *
 * 注意：
 *  - 需绕过沙箱执行（无头浏览器要在沙箱外启动），否则 Edge 起不来。
 *  - 产物在 D:\jiuli\temp_preview\*.png，高度固定 6000，尾部黑边需自行裁掉。
 *  - 生产渲染走后端 body.screenshot（整元素截图），不受此处固定高度影响。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

// 脚本在 <repo>/docs/tools/ 下，插件根目录往上两级
const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// ROOT 只用来找 jiuli 的凭证与 node_modules
const ROOT = process.env.JIULI_ROOT || 'D:/jiuli'
const OUT = path.join(ROOT, 'temp_preview')

// ESM 从脚本自身目录向上找 node_modules，脚本不在 jiuli 里，所以显式锚定到 jiuli
const require = createRequire(path.join(ROOT, 'package.json'))
const template = require('art-template')

const load = (p) => import(pathToFileURL(path.join(PLUGIN, p)).href)
const { ApiService } = await load('utils/api.js')
const { buildListRows, buildDetailView, buildMetroProfile } = await load('utils/battleView.js')
const { promoMeta } = await load('utils/battleFmt.js')

const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PROFILE = path.join(OUT, 'profile')
fs.mkdirSync(OUT, { recursive: true })
// 上次异常退出会在 profile 里留 SingletonLock，导致后续 Edge 直接起不来（退出码 0 / 21）
try {
  fs.rmSync(PROFILE, { recursive: true, force: true })
} catch {}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const PNG_W = 2200
const PNG_H = 6000

function edge(args) {
  return execFileSync(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      `--user-data-dir=${PROFILE}`,
      ...args,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  )
}

/** Edge 无头偶发不落盘，重试到出文件为止 */
function shoot(htmlFile, name, data) {
  const html = template(path.join(PLUGIN, 'resources', htmlFile), data)
  const htmlPath = path.join(OUT, `${name}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')
  const url = `file:///${htmlPath.replace(/\\/g, '/')}`
  const png = path.join(OUT, `${name}.png`)

  for (let i = 0; i < 6; i++) {
    try {
      if (fs.existsSync(png)) fs.unlinkSync(png)
      edge([
        `--window-size=${PNG_W},${PNG_H}`,
        // 图多（地铁详情 60+ 张 CDN 图），预算给小了会截到未加载的破图；
        // 重试时逐次加预算，越到后面越有耐心
        `--virtual-time-budget=${Number(process.env.VTB || 25000) + i * 10000}`,
        `--screenshot=${png.replace(/\\/g, '/')}`,
        url,
      ])
    } catch {
      /* 重试 */
    }
    for (let w = 0; w < 8; w++) {
      if (fs.existsSync(png) && fs.statSync(png).size > 1000) {
        console.log(`saved ${name}.png`)
        return
      }
      sleep(150)
    }
  }
  console.log(`[fail] ${name}`)
}

const api = new ApiService()
const store = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/PUBG-Helper-Plugin/UserData.json'), 'utf8'),
)
const camp = Object.values(store)
  .map((v) => v.camp)
  .filter(Boolean)[0]
if (!camp) {
  console.error('没有可用营地凭证，先扫码登录一次')
  process.exit(1)
}
api.useCamp(camp)
const roleId = await api.get_self_role_id()
console.log('roleId:', roleId, '| roleName:', camp.roleName)

// 调试用：ONLY=list / ONLY=detail 只渲染一半；REUSE=1 复用已落盘的 view_*.json 不重复打接口
const ONLY = process.env.ONLY || ''
const REUSE = process.env.REUSE === '1'

// ---- 列表：全部 / 排位 / 地铁 / 团竞 ----
const TABS = [
  { key: 'all', name: '全部', tabIndex: -1, type: 'classic' },
  { key: 'rank', name: '排位', tabIndex: 0, type: 'classic' },
  { key: 'metro', name: '地铁', tabIndex: 5, type: 'metro' },
  { key: 'tdm', name: '团竞', tabIndex: 2, type: 'tdm' },
]
for (const tab of ONLY === 'detail' ? [] : TABS) {
  const res = await api.get_pubgbattlelist(roleId, { page: 1, pageSize: 10, tabIndex: tab.tabIndex })
  const list = (res.data && res.data.list) || []
  let profile = null
  if (tab.type === 'metro') {
    const pr = await api.get_escaperecord(roleId)
    if (pr.returnCode === 0) profile = buildMetroProfile(pr.data)
  }
  shoot('battlelist.html', `list_${tab.key}`, {
    roleName: camp.roleName || roleId,
    tabName: tab.name,
    page: 1,
    nextPage: 2,
    hasMore: Number((res.data || {}).hasMore || 0) === 1,
    profile,
    rows: buildListRows(list, tab, 1),
  })
}

// ---- 最近战绩（#和平最近战绩 同款渲染）----
if (ONLY === '' || ONLY === 'recent') {
  const res = await api.get_recentbattlelist(roleId, 10)
  const list = (res.data && res.data.list) || []
  shoot('recentbattle.html', 'list_recent', {
    roleName: camp.roleName || roleId,
    total: list.length,
    rows: list.map((item, i) => ({
      idx: i + 1,
      modeIcon: item.modeIcon || '',
      modeDesc: item.modeDesc || '',
      mapDesc: item.mapDesc || '',
      teamRank: item.teamRank || '',
      killingCount: item.killingCount ?? '—',
      damageAmount: item.damageAmount ?? '—',
      playTime: item.playTime || '',
      isMvp: Number(item.isMvp) === 1,
      gradeIcon: item.ratingIcon || '',
      gradeText: item.ratingValue || '',
      ribbon: promoMeta(item.promotion, item.result),
    })),
  })
}

// ---- 详情：地铁 / 超体(创意) / 团竞 / 经典 ----
const picks = {}
for (const tabIndex of ONLY === 'list' || REUSE ? [] : [-1, 0, 1, 2, 5]) {
  for (let page = 1; page <= 4; page++) {
    const res = await api.get_pubgbattlelist(roleId, { page, pageSize: 10, tabIndex })
    const list = (res.data && res.data.list) || []
    if (!list.length) break
    for (const it of list) {
      if (it.tabIndex === 5 && !picks.metro) picks.metro = it
      if (it.modeDesc === '创意' && !picks.super) picks.super = it
      if (it.tabIndex === 2 && !picks.tdm) picks.tdm = it
      if (it.mapDesc === '金秋龙狮城' && !picks.classic) picks.classic = it
    }
  }
}

const KEYS = REUSE ? ['metro', 'super', 'tdm', 'classic'] : Object.keys(picks)
for (const k of KEYS) {
  const it = picks[k]
  const cacheFile = path.join(OUT, `view_${k}.json`)
  let view
  if (REUSE && fs.existsSync(cacheFile)) {
    view = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } else {
    if (!it) continue
    const res = await api.get_pubgplaydetail(it.battleId, it.battleMode, roleId)
    if (res.returnCode !== 0) {
      console.log('detail fail', k, res.returnMsg)
      continue
    }
    view = buildDetailView(res.data, camp)
    fs.writeFileSync(cacheFile, JSON.stringify(view, null, 2), 'utf8')
  }
  shoot('battledetail.html', `detail_${k}`, {
    ...view,
    updateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
}

console.log('done')
