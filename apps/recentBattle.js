import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'
import { setBattleCache, getBattleCache } from '../utils/battleCache.js'
import { buildDetailView } from '../utils/battleView.js'
import { promoMeta } from '../utils/battleFmt.js'

const apiService = new ApiService()

export class RecentBattle extends plugin {
  constructor() {
    super({
      name: '[PHP]最近战绩',
      dsc: '查询最近对局列表与单局战绩详情（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平最近战绩(\\d+)?$', fnc: 'showRecentBattle' },
        { reg: '^#和平战绩详情(\\d+)$', fnc: 'showBattleDetail' },
      ],
    })
  }

  // ---- 最近对局列表 ----
  async showRecentBattle(e) {
    const countArg = (e.msg.match(/^#和平最近战绩(\d+)?$/)?.[1]) || 10
    const count = Math.min(Math.max(Number(countArg) || 10, 1), 30)

    await e.reply(`⏳ 正在查询最近 ${count} 局战绩...`)
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const res = await apiService.get_recentbattlelist(roleId, count)
      if (res.returnCode !== 0) return e.reply('❌ 战绩列表获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))

      const list = (res.data && res.data.list) || []
      if (!list.length) return e.reply('最近暂无对局记录')

      // 写入缓存供详情指令使用
      setBattleCache(e.user_id, roleId, list, 'recent')

      const rows = list.map((item, i) => ({
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
        ribbon: promoMeta(item.promotion),
      }))

      const image = await puppeteer.screenshot('recentbattle', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/recentbattle.html',
        roleName: camp.roleName || camp.nickName || roleId,
        total: rows.length,
        rows,
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 最近战绩查询失败：' + (err.message || err))
    }
  }

  // ---- 单局战绩详情（支持经典/地铁/超体/团竞） ----
  async showBattleDetail(e) {
    const idxArg = Number(e.msg.match(/^#和平战绩详情(\d+)$/)?.[1])
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    const battleCache = getBattleCache()
    if (battleCache.userId !== e.user_id || !battleCache.list.length) {
      return e.reply('❌ 请先使用 #和平最近战绩 或 #和平战绩 查询后再查看详情')
    }
    const item = battleCache.list[idxArg - 1]
    if (!item || !item.battleId) return e.reply(`❌ 编号 ${idxArg} 不在最近战绩列表中`)

    await e.reply(`⏳ 正在查询第 ${idxArg} 局详情...`)
    apiService.useCamp(camp)
    try {
      const res = await apiService.get_pubgplaydetail(item.battleId, item.battleMode, battleCache.roleId)
      if (res.returnCode !== 0) return e.reply('❌ 战绩详情获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))

      const image = await puppeteer.screenshot('battledetail', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/battledetail.html',
        ...buildDetailView(res.data || {}, camp),
        updateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 战绩详情查询失败：' + (err.message || err))
    }
  }
}
