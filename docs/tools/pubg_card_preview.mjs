/**
 * 卡片预览脚本（开发用）：把 resources 下的模板用示例数据渲染成 PNG，肉眼校验排版。
 *
 * 用法：
 *   node docs/tools/pubg_card_preview.mjs [模板名...]
 *   node docs/tools/pubg_card_preview.mjs signin signinAll camps
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
  help: {},
  coins: { roleName: '秋舞风', roleId: '3508062251', date: '2026/10/24', coins },
  signin: {
    roleName: '秋舞风', roleId: '3508062251', dateText: '2026/10/24',
    tone: 'ok', emoji: '✅', status: '签到成功', note: '奖励已入账，明天 00:00 后再来',
    fulibi: '32,030', fragment: '1,280', liveness: '80/100', todayTasks: '6/10', coins,
    taskNote: '本次自动完成 9 项 · 领手册积分 40 分 · 营地奖励 2 份',
    rewardsText: '福利币 ×50、营地装饰碎片 ×2',
    tasks: [
      { name: '营地每日任务', value: '6/10', tone: '' },
      { name: '福利中心任务', value: '3/3', tone: 'good' },
      { name: '手册周任务', value: '12/14', tone: '' },
      { name: '手册积分', value: '领到 4 项', tone: 'good' },
    ],
  },
  signinAll: {
    total: 3, signOk: 2, signDone: 1, fail: 0,
    taskRate: '46/58', pointSum: 90, dateText: '2026/10/29',
    rows: [
      { no: 1, name: '秋舞风', roleId: '3508062251', signText: '签到成功', signTone: 'good', taskText: '18/18', taskTone: 'good', pointText: '+50分', note: '本次自动完成 9 项 · 领手册积分 50 分' },
      { no: 2, name: '小号', roleId: '1981655374', signText: '今天已经签过到了', signTone: 'warn', taskText: '16/20', taskTone: '', pointText: '+40分', note: '本次自动完成 6 项 · 领手册积分 40 分' },
      { no: 3, name: '备用号', roleId: '1011464912', signText: '签到成功', signTone: 'good', taskText: '12/20', taskTone: '', pointText: '—', note: '今日任务均已处理' },
    ],
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
  coins: ['coins.html', 'coins'],
  signin: ['signin.html', 'signin'],
  signinAll: ['signinAll.html', 'signinAll'],
  camps: ['camps.html', 'camps'],
  help: ['help.html', 'help'],
}

const want = process.argv.slice(2)
for (const [key, [tpl, name]] of Object.entries(map)) {
  if (want.length && !want.includes(key)) continue
  shoot(tpl, `card-${name}`, data[key])
}
