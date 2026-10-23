/**
 * 卡片预览脚本（开发用）：把 resources 下的模板用示例数据渲染成 PNG，肉眼校验排版。
 *
 * 用法：
 *   node docs/tools/pubg_card_preview.mjs [模板名...]
 *   node docs/tools/pubg_card_preview.mjs weekly camps
 *
 * 产物在 D:\jiuli\temp_preview\card-*.png
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ROOT = process.env.JIULI_ROOT || 'D:/jiuli'
const OUT = path.join(ROOT, 'temp_preview')
const require = createRequire(path.join(ROOT, 'package.json'))
const template = require('art-template')

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PROFILE = path.join(OUT, 'profile')
fs.mkdirSync(OUT, { recursive: true })
try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch {}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function edge(args) {
  return execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    `--user-data-dir=${PROFILE}`, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })
}

function shoot(tpl, name, data, w = 2160, h = 2600) {
  const html = template(path.join(PLUGIN, 'resources', tpl), data)
  const htmlPath = path.join(OUT, `${name}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')
  const url = `file:///${htmlPath.replace(/\\/g, '/')}`
  const png = path.join(OUT, `${name}.png`)
  for (let i = 0; i < 4; i++) {
    try {
      if (fs.existsSync(png)) fs.unlinkSync(png)
      edge([`--window-size=${w},${h}`, `--virtual-time-budget=${15000 + i * 8000}`, `--screenshot=${png.replace(/\\/g, '/')}`, url])
    } catch { /* retry */ }
    for (let k = 0; k < 8; k++) {
      if (fs.existsSync(png) && fs.statSync(png).size > 1000) { console.log(`saved ${name}.png`); return }
      sleep(150)
    }
  }
  console.log(`[fail] ${name}`)
}

const coins = [
  { name: '福利币', numFmt: '32,030', initial: '福', main: true },
  { name: '营地装饰碎片', numFmt: '1,280', initial: '营' },
  { name: '赛季积分', numFmt: '520', initial: '赛' },
]

const data = {
  weekly: {
    roleName: '秋舞风', roleId: '3508062251', season: 'S6',
    total: 24, acted: 2, waitCount: 6, skipCount: 2,
    waitNames: '浏览资讯、查看战绩复盘、分享战绩',
    skipNames: '需在 App 看放映中心 3 分钟、需在 App 点开绿洲专区页',
    weeks: [
      { no: 5, done: 4, total: 4, percent: 100, rows: [
        { title: '登录和平营地', progress: '5/5 待领', status: 'waitClaim', icon: '🎁', note: '' },
        { title: '分享战绩', progress: '3/3 待领', status: 'waitClaim', icon: '🎁', note: '' },
      ] },
      { no: 6, done: 2, total: 4, percent: 50, rows: [
        { title: '查看战绩复盘', progress: '1/3', status: 'acted', icon: '＋', note: '累计 3 天，今天 +1' },
        { title: '浏览资讯', progress: '5/5 待领', status: 'waitClaim', icon: '🎁', note: '' },
        { title: '浏览页面', progress: '3/3 待领', status: 'waitClaim', icon: '🎁', note: '' },
        { title: '浏览页面', progress: '0/1', status: 'skip', icon: '—', note: '需在 App 点开绿洲专区页（客户端埋点）' },
      ] },
    ],
  },
  dailyTasks: {
    roleName: '秋舞风', roleId: '3508062251', date: '2026/10/24',
    scoreDone: 6, scoreTotal: 10, welfareDone: 3, welfareTotal: 3, rewardCount: 2,
    rewards: ['福利币 ×50', '营地装饰碎片 ×2'], rewardsText: '福利币 ×50、营地装饰碎片 ×2',
    liveness: '80/100', rounds: 3, welfareActed: 7, refreshCount: 2, likesCleared: 4,
    score: [
      { name: '每日签到', status: 'done', icon: '✓', note: '' },
      { name: '分享一次战绩', status: 'acted', icon: '＋', note: '已完成' },
      { name: '观看直播 5 分钟', status: 'skip', icon: '—', note: '暂不支持自动完成' },
      { name: '开启对局工具', status: 'fail', icon: '✕', note: '只开启 3/4' },
    ],
    welfare: [
      { name: '浏览资讯 3 条', status: 'done', icon: '✓', note: '已领取' },
      { name: '给好友点赞', status: 'waitClaim', icon: '🎁', note: '已完成，待手动领取' },
    ],
  },
  coins: { roleName: '秋舞风', roleId: '3508062251', date: '2026/10/24', coins },
  signin: {
    roleName: '秋舞风', roleId: '3508062251', dateText: '2026/10/24',
    tone: 'ok', emoji: '✅', status: '签到成功', note: '奖励已入账，明天 00:00 后再来',
    fulibi: '32,030', fragment: '1,280', liveness: '80/100', todayTasks: '6/10', coins,
  },
  camps: {
    total: 2,
    camps: [
      { no: 1, name: '秋舞风', platform: '微信', roleId: '3508062251', tokenTail: 'Ke5H7w****Rm32', updatedAt: '2026/10/22', isCurrent: true },
      { no: 2, name: '小号', platform: 'QQ', roleId: '1981655374', tokenTail: 'U2FcTz****1r9Q', updatedAt: '2026/10/24', isCurrent: false },
    ],
  },
}

const map = {
  weekly: ['weekly.html', 'weekly'],
  dailyTasks: ['dailyTasks.html', 'dailyTasks'],
  coins: ['coins.html', 'coins'],
  signin: ['signin.html', 'signin'],
  camps: ['camps.html', 'camps'],
}

const want = process.argv.slice(2)
for (const [key, [tpl, name]] of Object.entries(map)) {
  if (want.length && !want.includes(key)) continue
  shoot(tpl, `card-${name}`, data[key])
}
