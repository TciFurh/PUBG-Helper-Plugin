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
import { ApiService } from '../utils/api.js'
import { runDailyTasks } from '../utils/dailyTask.js'
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
const ICON = { done: '✅', acted: '🆕', skip: '⏭', fail: '❌' }

function describeView(view, roleName) {
  const lines = [`📋 ${roleName} · 营地任务`]
  lines.push('── 积分任务（签到页） ──')
  for (const r of view.score) {
    lines.push(`${ICON[r.status] || '·'} ${r.name}${r.note ? `（${r.note}）` : ''}`)
  }
  if (view.liveness) lines.push(`活跃度 ${view.liveness}${view.gifts.length ? `，已领：${view.gifts.join('、')}` : ''}`)
  lines.push('── 福利任务（每天 3 条） ──')
  for (const r of view.welfare) {
    lines.push(`${ICON[r.status] || '·'} ${r.name}${r.note ? `（${r.note}）` : ''}`)
  }
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
      await e.reply(describeView(view, ctx.camp.roleName || ctx.camp.nickName || roleId))
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
      e.reply(await statusText(ctx.api, roleId, ctx.camp.roleName || ctx.camp.nickName || roleId))
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
        try {
          const roleId = await api.get_self_role_id()
          const view = await runDailyTasks(api, roleId)
          blocks.push(describeView(view, camp.roleName || camp.nickName || camp.userId))
        } catch (err) {
          blocks.push(`⚠️ ${camp.roleName || camp.userId} 任务执行失败：${err.message || err}`)
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
