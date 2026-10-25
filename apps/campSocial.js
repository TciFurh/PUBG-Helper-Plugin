/**
 * 营地资料查询：营地币余额 / 访客记录 / 在线好友 / 官方赛事。
 * 全部为读操作，接口来自 apktool 反编译提取（详见 docs/DEVELOPMENT.md）。
 *
 * - `#和平营地币`   —— 各币种余额（福利币、营地装饰碎片…）
 * - `#和平访客`     —— 谁看过你的主页（最近 10 位）
 * - `#和平在线好友` —— 游戏好友在线状态
 * - `#和平赛事`     —— 官方赛事列表（PEL/PSI 等）
 */
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { requireCamp } from '../utils/storage.js'
import Button from '../utils/button.js'


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
        { reg: '^#?和平营地币$', fnc: 'coins' },
        { reg: '^#?和平访客$', fnc: 'visits' },
        { reg: '^#?和平在线好友$', fnc: 'onlineFriends' },
        { reg: '^#?和平赛事$', fnc: 'leagues' },
      ],
    })
  }

  #context(e) {
    const camp = requireCamp(e)
    if (!camp) return null
    const api = new ApiService()
    api.useCamp(camp)
    return { camp, api }
  }

  async coins(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录', Button.bind()])
    try {
      const res = await ctx.api.get_user_coins()
      const raw = res?.data?.coins || []
      if (!raw.length) return e.reply('暂无营地币数据')
      const roleName = ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || '我'
      const roleId = ctx.camp.roleId || ''
      const coins = raw.map((c) => {
        const num = Number(c.num) || 0
        const name = c.name || '未知货币'
        return {
          name,
          num,
          numFmt: num.toLocaleString('en-US'),
          initial: name.slice(0, 1),
          main: /福利币/.test(name),
        }
      })
      const heroCoin = coins.find((c) => c.main) || coins[0]
      const others = coins.filter((c) => c !== heroCoin)
      let image = null
      try {
        image = await puppeteer.screenshot('coins', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/coins.html',
          roleName,
          roleId,
          date: new Date().toLocaleDateString('zh-CN'),
          hero: heroCoin,
          others,
          coinsCount: coins.length,
        })
      } catch { /* 渲染失败回文本 */ }
      if (image) return e.reply([image, Button.coins()])
      // 兜底：渲染失败回文本
      const lines = [`💰 ${roleName} 的营地资产`]
      for (const c of coins) lines.push(`· ${c.name}：${c.numFmt}`)
      e.reply([lines.join('\n'), Button.assets()])
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async visits(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录', Button.bind()])
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
      e.reply([lines.join('\n'), Button.assets()])
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async onlineFriends(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录', Button.bind()])
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
      e.reply([lines.join('\n'), Button.assets()])
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }

  async leagues(e) {
    const ctx = this.#context(e)
    if (!ctx) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录', Button.bind()])
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
      e.reply([lines.join('\n'), Button.assets()])
    } catch (err) {
      e.reply('❌ 查询失败：' + (err.message || err))
    }
  }
}
