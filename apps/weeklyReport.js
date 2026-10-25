import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import Button from '../utils/button.js'
import { localImage } from '../utils/localImg.js'

import { getCamp, getUserInfo } from '../utils/storage.js'

const apiService = new ApiService()

function fmtTime(ts) {
  const d = new Date(Number(ts) * 1000)
  if (isNaN(d.getTime())) return '暂无'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export class WeeklyReport extends plugin {
  constructor() {
    super({
      name: '[PHP]周报',
      dsc: '查询本周对局数据（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#?和平周报$', fnc: 'showWeeklyReport' },
      ],
    })
  }

  async showWeeklyReport(e) {
    await e.reply('⏳ 正在查询本周数据...')
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）', Button.bind()])

    apiService.useCamp(camp)
    try {
      const res = await apiService.get_weeklyreport()
      if (res.returnCode !== 0) return e.reply('❌ 周报获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))
      const row = (res.data || [])[0] || {}
      if (!row.seasonId) return e.reply('❌ 本周暂无对局数据')

      const ratingChange = Number(row.ratingChange || 0)
      const kdChange = Number(row.kdChange || 0)
      // 比率（除零保护）
      const battleNum = Number(row.battleNum || 0)
      const winNum = Number(row.winNum || 0)
      const top10Num = Number(row.top10Num || 0)
      const killNum = Number(row.killNum || 0)
      const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
      const winRate = pct(winNum, battleNum)
      const top10Rate = pct(top10Num, battleNum)
      const killAvg = battleNum > 0 ? (killNum / battleNum).toFixed(2) : '0.00'
      const killAvgPct = battleNum > 0 ? Math.min(100, Math.round((killNum / battleNum) * 20)) : 0
      // 段位图标本地缓存（避免网络裂图）
      const segmentPicLocal = row.segmentPic ? await localImage(row.segmentPic, `segment_${row.segmentId || row.segmentName || 'x'}.png`) : ''
      const image = await puppeteer.screenshot('weeklyreport', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/weeklyreport.html',
        roleName: camp.roleName || camp.nickName || '我',
        seasonId: row.seasonId,
        segmentPic: row.segmentPic || '',
        segmentPicLocal,
        segmentName: row.segmentName || '暂无段位',
        winRate,
        top10Rate,
        killAvg,
        killAvgPct,
        currentRating: row.currentRating ?? '—',
        ratingChangeText: (ratingChange > 0 ? '+' : '') + ratingChange,
        ratingClass: ratingChange >= 0 ? 'up' : 'down',
        ratingChangeBefore: row.ratingChangeBefore ?? '—',
        ratingChangeAfter: row.ratingChangeAfter ?? '—',
        battleNum,
        winNum,
        top10Num,
        killNum,
        deadNum: row.deadNum ?? 0,
        kd: row.kd ?? '0.00',
        kdChangeText: (kdChange > 0 ? '+' : '') + kdChange,
        kdClass: kdChange >= 0 ? '#e0e0e0' : '#9a9a9a',
        ratingChangeAvg: row.ratingChangeAvg ?? '—',
        updateTime: fmtTime(row.updateTime),
      })
      e.reply([image, Button.homepage()])
    } catch (err) {
      e.reply('❌ 周报查询失败：' + (err.message || err))
    }
  }
}
