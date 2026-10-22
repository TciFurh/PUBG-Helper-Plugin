/**
 * 营地资料查询：营地币余额 / 访客记录 / 在线好友 / 官方赛事。
 * 全部为读操作，接口来自 apktool 反编译提取（详见 docs/DEVELOPMENT.md）。
 *
 * - `#和平营地币`   —— 各币种余额（福利币、营地装饰碎片…）
 * - `#和平访客`     —— 谁看过你的主页（最近 10 位）
 * - `#和平在线好友` —— 游戏好友在线状态
 * - `#和平赛事`     —— 官方赛事列表（PEL/PSI 等）
 */
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'

/** 好友/访客的 onlineStatus 值 → 文案（营地 App 口径，未知值原样展示） */
function onlineText(v) {
  const map = { 1: '在线', 2: '游戏中', 3: '离线', 4: '隐身' }
  return map[Number(v)] || (v === undefined || v === '' ? '' : `状态${v}`)
}

export class CampSocial extends plugin {
  constructor() {
    super({
      name: '[PHP]营地资料',
      dsc: '营地币余额 / 访客记录 / 在线好友 / 官方赛事',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平营地币$', fnc: 'coins' },
        { reg: '^#和平访客$', fnc: 'visits' },
        { reg: '^#和平在线好友$', fnc: 'onlineFriends' },
        { reg: '^#和平赛事$', fnc: 'leagues' },
      ],
    })
  }

  #context(e) {
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return null
    const api = new ApiService()
    api.useCamp(camp)
    return { camp, api }
  }

  async coins(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const res = await ctx.api.get_user_coins()
      const coins = res?.data?.coins || []
      if (!coins.length) return e.reply('暂无营地币数据')
      const lines = [`💰 ${ctx.camp.roleName || ctx.camp.nickName || ''} 的营地资产`]
      for (const c of coins) lines.push(`· ${c.name || '未知货币'}：${Number(c.num).toLocaleString('en-US')}`)
      lines.push('', '福利币来自每日签到与营地任务（#和平任务）')
      e.reply(lines.join('\n'))
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async visits(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const res = await ctx.api.get_visits()
      const list = res?.data?.list || []
      if (!list.length) return e.reply('还没有访客记录')
      const lines = [`👀 最近访客（${list.length} 位）`]
      for (const v of list.slice(0, 10)) {
        const seg = [`「${v.nickname || '未知'}」`]
        if (v.roleName) seg.push(`角色 ${v.roleName}`)
        if (v.roleDesc) seg.push(v.roleDesc)
        seg.push(v.onlineStatus && Number(v.onlineStatus) !== 3 ? '在线' : (v.offlineTime || ''))
        if (Number(v.personalAuth) === 1) seg.push('认证')
        lines.push('· ' + seg.filter(Boolean).join(' · '))
      }
      e.reply(lines.join('\n'))
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async onlineFriends(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const roleId = await ctx.api.get_self_role_id()
      const res = await ctx.api.get_online_friends(roleId)
      const list = res?.data?.list || []
      if (!list.length) return e.reply('暂无好友数据')
      const lines = [`👤 好友在线（${list.length} 位）`]
      for (const f of list.slice(0, 15)) {
        const seg = [`「${f.nickname || f.userId}」`]
        const st = onlineText(f.online)
        if (st) seg.push(st)
        if (f.gameStatus) seg.push(f.gameStatus)
        if (f.isDualLuckyStar) seg.push('双幸运星')
        else if (f.isLuckyStar) seg.push('幸运星')
        lines.push('· ' + seg.filter(Boolean).join(' · '))
      }
      e.reply(lines.join('\n'))
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async leagues(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply('❌ 未找到营地登录凭证，请先扫码登录')
    try {
      const res = await ctx.api.get_league_list()
      const list = res?.data?.leagues || []
      if (!list.length) return e.reply('暂无赛事数据')
      const lines = ['🏆 官方赛事']
      for (const l of list.slice(0, 10)) {
        const seg = [l.name || l.Id]
        if (l.season) seg.push(l.season)
        if (l.leagueType) seg.push(l.leagueType)
        lines.push('· ' + seg.filter(Boolean).join(' · '))
      }
      e.reply(lines.join('\n'))
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }
}
