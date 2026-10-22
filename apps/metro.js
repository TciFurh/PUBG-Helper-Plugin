import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'

const apiService = new ApiService()

export class MetroQuery extends plugin {
  constructor() {
    super({
      name: '[PHP]地铁逃生查询',
      dsc: '查询地铁逃生战绩（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#?和平(精英|英精)?地铁(\d+)?$/i, fnc: 'showMetro' },
      ],
    })
  }

  async showMetro(e) {
    const m = e.msg.match(/^#?和平(精英|英精)?地铁(\d+)?$/i)
    const seasonArg = m?.[2] || ''
    await e.reply('⏳ 正在查询地铁逃生战绩...')

    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const res = await apiService.get_escaperecord(roleId, seasonArg)
      if (res.returnCode !== 0) {
        return e.reply('❌ 地铁数据获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))
      }

      const data = res.data || {}
      const record = (data.escapeRecord && data.escapeRecord[0]) || {}
      const pro = (record.pro || []).map((x) => x.v && x.v.v)
      const subPro = (record.subPro || []).map((x) => x.v && x.v.v)

      const image = await puppeteer.screenshot('metro', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/metro.html',
        roleName: camp.roleName || camp.nickName || roleId,
        seasonName: data.escapeSeasonName || '当前赛季',
        seasonId: data.escapeSeasonId ?? '',
        divIcon: record.divIcon || '',
        divName: record.divName || '暂无段位',
        featText: `${record.currentFeat ?? 0}/${record.levelUpFeat ?? 0}`,
        featPercent: record.levelProc ?? 0,
        matches: pro[0] ?? '—',
        kd: pro[1] ?? '—',
        maxIncome: pro[2] ?? '—',
        totalIncome: pro[3] ?? '—',
        escapeRate: subPro[0] ?? '—',
        playerKills: subPro[1] ?? '—',
        banditKills: subPro[2] ?? '—',
        monsterKills: subPro[3] ?? '—',
        updated: new Date().toLocaleString('zh-CN', {
          hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }),
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 地铁查询失败：' + (err.message || err))
    }
  }
}
