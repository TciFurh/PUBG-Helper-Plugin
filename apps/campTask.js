/**
 * 和平营地「福利中心」每日任务：自动完成 + 状态查询 + 定时自动跑。
 *
 * ## 指令
 * - `#和平任务`     —— 把能自动做的任务做一遍并领奖，回结果清单
 * - `#和平任务状态` —— 只看两边任务列表的完成情况，不做动作
 * - `#开启/关闭和平自动任务` —— 定时自动跑的开关（默认开，每天 07:40）
 *
 * ## 定时任务
 * cron 默认 `0 40 7 * * *`（比签到晚 10 分钟）。跑的是 data/PUBG-Helper-Plugin/UserData.json
 * 里**所有有凭证的号**，结果汇总后发给主人（Bot.sendMasterMsg）。
 * 关掉只停定时，不影响手动 `#和平任务`。
 *
 * 任务系统的接口与动作说明见 utils/dailyTask.js 头注释。
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { runDailyTasks, runWeeklyTasks } from '../utils/dailyTask.js'
import { getCamp } from '../utils/storage.js'

const CFG_FILE = path.resolve('./data/PUBG-Helper-Plugin/TaskConfig.json')
/** 定时默认 07:40（签到默认 07:30，错开 10 分钟） */
const DEFAULT_CRON = '0 40 7 * * *'

function loadCfg() {
  try {
    return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveCfg(cfg) {
  fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true })
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
}

/** 状态值 → 展示符号 */
const ICON = { done: '✅', acted: '🆕', skip: '⏭', fail: '❌', waitClaim: '🎁' }

function describeView(view, roleName) {
  const lines = [`📋 ${roleName} · 营地任务`]
  lines.push('── 积分任务（签到页） ──')
  for (const r of view.score) {
    lines.push(`${ICON[r.status] || '·'} ${r.name}${r.note ? `（${r.note}）` : ''}`)
  }
  if (view.liveness) lines.push(`活跃度 ${view.liveness}${view.gifts.length ? `，已领：${view.gifts.join('、')}` : ''}`)
  lines.push('── 福利任务（每天 3 条，可刷新换新） ──')
  for (const r of view.welfare) {
    lines.push(`${ICON[r.status] || '·'} ${r.name}${r.note ? `（${r.note}）` : ''}`)
  }
  if (view.rounds > 1 || view.welfareActed) lines.push(`🔁 共刷 ${view.rounds} 轮，自动完成 ${view.welfareActed} 次（今日已刷新 ${view.refreshCount} 次）`)
  if (view.rewards.length) lines.push(`🎁 领到：${view.rewards.join('、')}`)
  if (view.likesCleared) lines.push(`🧹 已撤回本次任务点赞 ${view.likesCleared} 次`)
  if (view.refreshCount) lines.push(`🔄 福利任务剩余刷新次数：${view.refreshCount}`)
  return lines.join('\n')
}

/** 只读：拉两份列表拼成状态文本（不发任何动作请求） */
async function statusText(api, roleId, roleName) {
  const [score, welfare] = await Promise.all([
    api.get_score_tasklist(roleId),
    api.get_welfare_tasklist(roleId),
  ])
  const lines = [`📋 ${roleName} · 任务状态`]
  lines.push('── 积分任务（签到页） ──')
  for (const t of score?.data?.taskList || []) {
    lines.push(`${Number(t.status) === 0 ? '⬜' : '✅'} ${t.detailDesc || t.taskId}`)
  }
  const lv = score?.data?.liveness || {}
  if (lv.current != null) lines.push(`活跃度 ${lv.current}/${lv.total ?? 100}`)
  lines.push('── 福利任务 ──')
  for (const t of welfare?.data?.tasks || []) {
    const st = Number(t.status)
    lines.push(`${st === 2 ? '✅' : st === 1 ? '🎁' : '⬜'} ${t.title || t.taskId}${st === 1 ? '（可领取）' : ''}`)
  }
  return lines.join('\n')
}

/** 游戏手册周任务结果 → 文案（只做不领） */
function describeWeekly(view, roleName) {
  const lines = [`📘 ${roleName} · 游戏手册周任务（season ${view.seasonID}）`]
  for (const w of view.weeks) {
    lines.push(`── 第 ${w.weekNo} 周 ──`)
    for (const r of w.rows) {
      lines.push(`${ICON[r.status] || '·'} ${r.title}（${r.progress}）${r.note ? ` ${r.note}` : ''}`)
    }
  }
  if (view.waitClaim.length) {
    lines.push(`🎁 已完成待领积分 ${view.waitClaim.length} 项：${view.waitClaim.join('、')}`)
    lines.push('（按你的要求没有自动领取，去营地 App 手册页手动领）')
  }
  if (view.skipped.length) lines.push(`⏭ 无法自动完成：${view.skipped.join('、')}`)
  if (view.acted) lines.push(`🆕 本次自动完成 ${view.acted} 项`)
  return lines.join('\n')
}

/** 手册周任务只读状态 */
async function weeklyStatusText(api, roleName, roleId) {
  const res = await api.get_season_pass_task(roleId)
  const data = res?.data || {}
  const lines = [`📘 ${roleName} · 手册周任务状态（season ${data.seasonID || '?'}）`]
  for (const w of (data.weekList || []).filter((x) => Number(x.isOpen) === 1)) {
    lines.push(`── 第 ${w.weekNo} 周 ──`)
    for (const t of w.taskList || []) {
      const st = Number(t.status)
      lines.push(`${st === 0 ? '⬜' : st === 1 ? '🎁' : '✅'} ${t.title}（${t.progress}/${t.maxProgress}）${st === 1 ? ' 待领积分' : ''}`)
    }
  }
  return lines.join('\n')
}

/** 图片卡里的状态符号（比 emoji 在不同字体下更稳） */
const CHIP = { done: '✓', acted: '＋', skip: '—', fail: '✕', waitClaim: '🎁' }

/** 每日任务 → 模板数据 */
export function dailyRenderData(view, roleName, roleId) {
  const pack = (rows) => (rows || []).map((r) => ({
    name: r.name,
    note: r.note || '',
    status: r.status,
    icon: CHIP[r.status] || '·',
  }))
  const score = pack(view.score)
  const welfare = pack(view.welfare)
  const doneCount = (rows) => rows.filter((r) => ['done', 'acted', 'waitClaim'].includes(r.status)).length
  const rewards = view.rewards || []
  return {
    roleName,
    roleId,
    date: new Date().toLocaleDateString('zh-CN'),
    score,
    welfare,
    scoreDone: doneCount(score),
    scoreTotal: score.length,
    welfareDone: doneCount(welfare),
    welfareTotal: welfare.length,
    rewardCount: rewards.length,
    rewards,
    rewardsText: rewards.join('、'),
    liveness: view.liveness ?? '-',
    rounds: view.rounds || 1,
    welfareActed: view.welfareActed || 0,
    refreshCount: view.refreshCount || 0,
    likesCleared: view.likesCleared || 0,
  }
}

/** 手册周任务 → 模板数据 */
export function weeklyRenderData(view, roleName, roleId) {
  const weeks = (view.weeks || []).map((w) => {
    const rows = (w.rows || []).map((r) => ({ ...r, icon: CHIP[r.status] || '·' }))
    const done = rows.filter((r) => ['done', 'waitClaim'].includes(r.status)).length
    return {
      no: w.weekNo,
      rows,
      done,
      total: rows.length,
      percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    }
  })
  return {
    roleName,
    roleId,
    season: view.seasonID || '?',
    weeks,
    total: weeks.reduce((n, w) => n + w.total, 0),
    acted: view.acted || 0,
    waitCount: (view.waitClaim || []).length,
    waitNames: (view.waitClaim || []).join('、'),
    skipCount: (view.skipped || []).length,
    skipNames: (view.skipped || []).join('、'),
  }
}

export class CampTask extends plugin {
  constructor() {
    super({
      name: '[PHP]营地每日任务',
      dsc: '自动完成营地福利中心每日任务（点赞/分享/浏览/工具/充能）并领奖',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平任务$', fnc: 'doTasks' },
        { reg: '^#和平任务状态$', fnc: 'taskStatus' },
        { reg: '^#和平周任务$', fnc: 'doWeeklyTasks' },
        { reg: '^#和平周任务状态$', fnc: 'weeklyStatus' },
        { reg: '^#(开启|打开|启用)和平自动任务$', fnc: 'enableAuto' },
        { reg: '^#(关闭|关掉|停用)和平自动任务$', fnc: 'disableAuto' },
      ],
    })
    /** 定时自动跑（配置关掉就不注册 cron） */
    if (loadCfg().autoTask !== false) {
      this.task = {
        cron: loadCfg().cron || DEFAULT_CRON,
        name: '和平营地每日任务',
        fnc: () => this.autoRun(),
      }
    }
    this.running = false
  }

  #context(e) {
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return null
    const api = new ApiService()
    api.useCamp(camp)
    return { camp, api }
  }

  /** `#和平任务`：把能做的做一遍 */
  async doTasks(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    if (this.running) return e.reply('⏳ 任务正在跑，稍等一下再试')
    this.running = true
    await e.reply('⏳ 正在自动完成营地每日任务...')
    try {
      const roleId = await ctx.api.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const view = await runDailyTasks(ctx.api, roleId)
      const roleName = ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || roleId
      try {
        const image = await puppeteer.screenshot('dailyTasks', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/dailyTasks.html',
          ...dailyRenderData(view, roleName, roleId),
        })
        if (image) return await e.reply(image)
      } catch { /* 渲染失败回文本 */ }
      await e.reply(describeView(view, roleName))
    } catch (err) {
      await e.reply('❌ 任务执行失败：' + (err.message || err))
    } finally {
      this.running = false
    }
  }

  /** `#和平任务状态`：只看不做 */
  async taskStatus(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const roleId = await ctx.api.get_self_role_id()
      e.reply(await statusText(ctx.api, roleId, ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || roleId))
    } catch (err) {
      e.reply('❌ 状态查询失败：' + (err.message || err))
    }
  }

  /** `#和平周任务`：游戏手册每周任务，只做不领 */
  async doWeeklyTasks(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')
    if (this.running) return e.reply('⏳ 任务正在跑，稍等一下再试')
    this.running = true
    await e.reply('⏳ 正在自动完成游戏手册每周任务（只做不领）...')
    try {
      const roleId = await ctx.api.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')
      const view = await runWeeklyTasks(ctx.api, roleId)
      const roleName = ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || roleId
      try {
        const image = await puppeteer.screenshot('weekly', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/weekly.html',
          ...weeklyRenderData(view, roleName, roleId),
        })
        if (image) return await e.reply(image)
      } catch { /* 渲染失败回文本 */ }
      await e.reply(describeWeekly(view, roleName))
    } catch (err) {
      await e.reply('❌ 周任务执行失败：' + (err.message || err))
    } finally {
      this.running = false
    }
  }

  /** `#和平周任务状态`：手册任务只读 */
  async weeklyStatus(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const roleId = await ctx.api.get_self_role_id()
      e.reply(await weeklyStatusText(ctx.api, ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || roleId, roleId))
    } catch (err) {
      e.reply('❌ 状态查询失败：' + (err.message || err))
    }
  }

  async enableAuto(e) {
    const cfg = loadCfg()
    cfg.autoTask = true
    saveCfg(cfg)
    const cron = cfg.cron || DEFAULT_CRON
    e.reply(`✅ 已开启和平自动任务（每天 ${cron}）\n定时任务需要重启 Bot 后生效；手动跑随时发 #和平任务`)
  }

  async disableAuto(e) {
    const cfg = loadCfg()
    cfg.autoTask = false
    saveCfg(cfg)
    e.reply('✅ 已关闭和平自动任务（#和平任务 仍可手动触发）')
  }

  /** 定时入口：所有有凭证的号都跑一遍，汇总发主人 */
  async autoRun() {
    if (this.running) return
    this.running = true
    try {
      const file = path.resolve('./data/PUBG-Helper-Plugin/UserData.json')
      const store = JSON.parse(fs.readFileSync(file, 'utf8'))
      const camps = Object.values(store)
        .map((v) => v.camp)
        .filter((c) => c && c.token)
      if (!camps.length) return

      const blocks = []
      for (const camp of camps) {
        const api = new ApiService()
        api.useCamp(camp)
        const who = camp.nickname || camp.roleName || camp.userName || camp.userId
        try {
          const roleId = await api.get_self_role_id()
          const view = await runDailyTasks(api, roleId)
          let text = describeView(view, who)
          // 手册周任务跟着一起做（只做不领）
          try {
            const wv = await runWeeklyTasks(api, roleId)
            text += '\n\n' + describeWeekly(wv, who)
          } catch (err) {
            text += `\n⚠️ 手册周任务执行失败：${err.message || err}`
          }
          blocks.push(text)
        } catch (err) {
          blocks.push(`⚠️ ${who} 任务执行失败：${err.message || err}`)
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (blocks.length) {
        const text = ['🌅 和平营地每日任务自动完成\n', ...blocks].join('\n\n')
        try {
          await Bot.sendMasterMsg(text)
        } catch {
          logger.warn('[营地任务] 发送主人消息失败：' + text)
        }
      }
    } catch (err) {
      logger.error('[营地任务] 定时执行异常: ' + (err.message || err))
    } finally {
      this.running = false
    }
  }
}
