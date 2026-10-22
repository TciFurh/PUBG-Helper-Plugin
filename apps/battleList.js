import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'
import { setBattleCache } from '../utils/battleCache.js'

const apiService = new ApiService()

// 分类定义：tabIndex → 名称/别名
const TABS = [
  { tabIndex: 0, name: '排位', aliases: ['排位', '计分', '经典'] },
  { tabIndex: 1, name: '匹配', aliases: ['匹配', '不计分', '创意工坊'] },
  { tabIndex: 2, name: '团竞', aliases: ['团竞', '团队竞技'] },
]

function val(v) {
  if (v && typeof v === 'object') return v.v
  return v
}

function fmtTime(ts) {
  const d = new Date(Number(ts) * 1000)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export class BattleList extends plugin {
  constructor() {
    super({
      name: '[PHP]全部战绩',
      dsc: '分类查看全部战绩（排位/匹配/团竞，分页展示，需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平战绩$', fnc: 'showOverview' },
        { reg: '^#和平战绩\\s*(排位|计分|经典|匹配|不计分|创意工坊|团竞|团队竞技)\\s*(\\d+)?$', fnc: 'showCategory' },
      ],
    })
  }

  async getRoleId(e) {
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) {
      e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')
      return null
    }
    apiService.useCamp(camp)
    const roleId = await apiService.get_self_role_id()
    if (!roleId) {
      e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')
      return null
    }
    return { camp, roleId }
  }

  /** 汇总：三个分类的场次统计 + 最新对局预览 */
  async showOverview(e) {
    const got = await this.getRoleId(e)
    if (!got) return
    const { camp, roleId } = got

    await e.reply('⏳ 正在统计各分类战绩...')
    try {
      const tabs = []
      for (const t of TABS) {
        const res = await apiService.get_pubgbattlelist(roleId, { page: 1, pageSize: 10, tabIndex: t.tabIndex })
        if (res.returnCode !== 0) {
          e.reply(`❌ 战绩统计失败：${res.returnMsg || res.returnCode}`)
          return
        }
        const list = (res.data && res.data.list) || []
        const winRes = await apiService.get_pubgbattlelist(roleId, { page: 1, pageSize: 10, tabIndex: t.tabIndex, filter: 1 })
        const winList = (winRes.data && winRes.data.list) || []
        const recent = list[0]
        tabs.push({
          name: t.name,
          total: res.data && res.data.hasMore ? '很多' : String(list.length),
          wins: String(winList.length || 0),
          recentTime: recent ? recent.playTime : '暂无',
          recentDesc: recent ? `${recent.modeDesc} · ${recent.mapDesc}` : '—',
          recentRank: recent ? (recent.teamRank || '') : '',
          recentKills: recent ? (recent.killingCount ?? '—') : '—',
          recentRating: recent ? (recent.ratingValue || '') : '',
          recentRatingChange: recent && recent.ratingChange ? recent.ratingChange : '',
        })
      }
      const image = await puppeteer.screenshot('battleoverview', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/battleoverview.html',
        roleName: camp.roleName || camp.nickName || roleId,
        tabs,
        updateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 战绩统计失败：' + (err.message || err))
    }
  }

  /** 分类列表（分页） */
  async showCategory(e) {
    const m = e.msg.match(/^#和平战绩\s*(排位|计分|经典|匹配|不计分|创意工坊|团竞|团队竞技)\s*(\d+)?$/)
    const alias = m[1]
    const page = Math.min(Math.max(Number(m[2]) || 1, 1), 10)
    const tab = TABS.find((t) => t.aliases.includes(alias))
    if (!tab) return e.reply('❌ 未知战绩分类，可选：排位 / 匹配 / 团竞')

    const got = await this.getRoleId(e)
    if (!got) return
    const { camp, roleId } = got

    await e.reply(`⏳ 正在查询${tab.name}战绩（第 ${page} 页）...`)
    try {
      const res = await apiService.get_pubgbattlelist(roleId, { page, pageSize: 10, tabIndex: tab.tabIndex })
      if (res.returnCode !== 0) return e.reply(`❌ 战绩获取失败：${res.returnMsg || res.returnCode}`)
      const d = res.data || {}
      const list = d.list || []
      if (!list.length) return e.reply(`❌ 第 ${page} 页没有更多${tab.name}战绩了`)

      // 写入共享缓存，供 #和平战绩详情 按编号取 battleId/battleMode
      setBattleCache(e.user_id, roleId, list, 'all')

      const rows = list.map((it, i) => {
        const isTdm = tab.tabIndex === 2
        return {
          idx: (page - 1) * 10 + i + 1,
          modeIcon: it.modeIcon || '',
          modeDesc: it.modeDesc || tab.name,
          mapDesc: it.mapDesc || '',
          isTdm,
          // 计分/匹配：排名+伤害；团竞：助攻+连杀+结果
          teamRank: it.teamRank || '',
          kills: it.killingCount ?? '—',
          assists: it.assistCount ?? '—',
          damage: it.damageAmount ?? '—',
          liansha: it.lianshaNum || '',
          lianshaIcon: it.lianshaIcon || '',
          resultIcon: it.resultIcon || '',
          result: it.result || '',
          ratingIcon: it.ratingIcon || '',
          ratingValue: it.ratingValue || '',
          ratingChange: it.ratingChange || '',
          isMvp: Number(it.isMvp) === 1,
          mvpIcon: it.mvpIcon || '',
          playTime: it.playTime || fmtTime(it.startime),
          hasDetail: Number(it.hasDetail || 0) === 1,
          battleId: it.battleId || '',
        }
      })

      const image = await puppeteer.screenshot('battlelist', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/battlelist.html',
        roleName: camp.roleName || camp.nickName || roleId,
        tabName: tab.name,
        page,
        nextPage: page + 1,
        hasMore: Number(d.hasMore || 0) === 1,
        rows,
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply(`❌ ${tab.name}战绩查询失败：` + (err.message || err))
    }
  }
}
