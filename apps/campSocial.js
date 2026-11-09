/**
 * 营地资料查询：货币余额 / 访客记录 / 在线好友 / 官方赛事。
 * 全部为读操作，接口来自 apktool 反编译提取（详见 docs/DEVELOPMENT.md）。
 *
 * - `#和平货币`     —— 营地货币（福利币/装饰碎片）+ 游戏内货币（点券/金币/服饰币/战备积分/物资币/荣耀勋章）
 * - `#和平访客`     —— 谁看过你的主页（最近 10 位）
 * - `#和平在线好友` —— 游戏好友在线状态
 * - `#和平赛事`     —— 官方赛事列表（PEL/PSI 等）
 */
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { requireCamp } from '../utils/storage.js'
import Button from '../utils/button.js'
import { localizeData } from '../utils/localImg.js'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/** 游戏内货币图标（营地 APK res 资源，拼音命名：dq=点券 jb=金币 fs=服饰 zbjf=战备） */
const CURRENCY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../resources/currency')
const GAME_ICONS = {
  点券: 'dianquan.png',
  金币: 'jinbi.png',
  服饰币: 'fushibi.png',
  战备积分: 'zhanbei.png',
  物资币: 'wuzibi.png',
  荣耀勋章: 'xunzhang.png',
}
const __iconCache = new Map()
function localCoinIcon(name) {
  const file = GAME_ICONS[name]
  if (!file) return ''
  if (!__iconCache.has(name)) {
    try {
      const buf = fs.readFileSync(path.join(CURRENCY_DIR, file))
      __iconCache.set(name, `data:image/png;base64,${buf.toString('base64')}`)
    } catch {
      __iconCache.set(name, '')
    }
  }
  return __iconCache.get(name)
}


/** 好友/访客的 onlineStatus 值 → 文案（营地 App 口径，未知值原样展示） */
function onlineText(v) {
  const map = { 1: '在线', 2: '游戏中', 3: '离线', 4: '隐身' }
  return map[Number(v)] || (v === undefined || v === '' ? '' : `状态${v}`)
}

export class CampSocial extends plugin {
  constructor() {
    super({
      name: '[PHP]营地资料',
      dsc: '货币余额 / 访客记录 / 在线好友 / 官方赛事',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#?和平(货币|营地币)$', fnc: 'coins' },
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
      const roleId = ctx.camp.roleId
      const [scoreRes, charRes] = await Promise.all([
        ctx.api.get_user_score(roleId).catch(() => null),
        ctx.api.get_charmandcoins(roleId).catch(() => null),
      ])
      // 营地货币：scoreList type=3 福利币 / type=5 装饰碎片（接口自带官方图标）
      const scoreList = scoreRes?.data?.scoreList || []
      const campCoins = [[3, '福利币'], [5, '装饰碎片']].map(([type, name]) => {
        const s = scoreList.find((x) => String(x.type) === String(type))
        const num = Number(s?.num ?? 0)
        return { name, num, numFmt: num.toLocaleString('en-US'), icon: s?.icon || '' }
      })
      // 游戏内货币（字段映射与资产页一致：ticket=点券 gold=金币 diamond=服饰币
      // universalScore=战备积分 itemCoin=物资币 ironCoin=荣耀勋章）
      const d = charRes?.data || {}
      const gameDefs = [
        ['点券', 'ticket'],
        ['金币', 'gold'],
        ['服饰币', 'diamond'],
        ['战备积分', 'universalScore'],
        ['物资币', 'itemCoin'],
        ['荣耀勋章', 'ironCoin'],
      ]
      const gameCoins = gameDefs.map(([name, key]) => {
        const num = Number(d[key]) || 0
        return { name, num, numFmt: num.toLocaleString('en-US'), icon: localCoinIcon(name) }
      })
      const roleName = ctx.camp.nickname || ctx.camp.roleName || ctx.camp.userName || '我'
      const tplData = {
        roleName,
        updated: new Date().toLocaleString('zh-CN', { hour12: false }),
        total: campCoins.length + gameCoins.length,
        campCoins,
        gameCoins,
      }
      await localizeData(tplData)
      const image = await puppeteer.screenshot('currency', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/currency.html',
        ...tplData,
      })
      if (image) return e.reply([image, Button.coins()])
      // 兜底：渲染失败回文本
      const lines = [`💰 ${roleName} 的货币资产`]
      for (const c of [...campCoins, ...gameCoins]) lines.push(`· ${c.name}：${c.numFmt}`)
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
