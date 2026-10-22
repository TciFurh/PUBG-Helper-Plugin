import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'
import { setBattleCache } from '../utils/battleCache.js'

const apiService = new ApiService()

// 营地战绩分类（对应 getpubgbattlelist 的 tabIndex；地铁/古墓另有赛季档案接口）
// tabIndex: -1=全部, 0=计分(排位), 1=不计分(匹配), 2=团竞, 5=地铁, 6=绿洲共创,
//           3=巅峰赛, 4=全民赛场, 7=古墓迷途, 8=谁是内鬼（后四类需账号有对应对局才有数据）
const TABS = [
  { key: 'all', name: '全部', aliases: ['全部'], tabIndex: -1, type: 'classic' },
  { key: 'rank', name: '排位', aliases: ['排位', '计分'], tabIndex: 0, type: 'classic' },
  { key: 'metro', name: '地铁', aliases: ['地铁', '地铁逃生'], tabIndex: 5, type: 'metro' },
  { key: 'tomb', name: '古墓', aliases: ['古墓', '古墓迷途'], tabIndex: 7, type: 'tomb' },
  { key: 'tdm', name: '团竞', aliases: ['团竞', '团队竞技'], tabIndex: 2, type: 'tdm' },
  { key: 'peak', name: '巅峰赛', aliases: ['巅峰', '巅峰赛'], tabIndex: 3, type: 'classic' },
  { key: 'pro', name: '全民赛场', aliases: ['全民', '全民赛场'], tabIndex: 4, type: 'classic' },
  { key: 'evo', name: '绿洲', aliases: ['绿洲', '绿洲共创'], tabIndex: 6, type: 'classic' },
  { key: 'match', name: '匹配', aliases: ['匹配', '不计分'], tabIndex: 1, type: 'classic' },
  { key: 'mole', name: '内鬼', aliases: ['内鬼', '谁是内鬼'], tabIndex: 8, type: 'classic' },
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

function fmtIncome(n) {
  const v = Number(n)
  if (isNaN(v) || v <= 0) return '—'
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + 'w'
  return String(v)
}

export class BattleList extends plugin {
  constructor() {
    super({
      name: '[PHP]全部战绩',
      dsc: '分类查看全部战绩（全部/排位/地铁/古墓/团竞/巅峰赛/全民赛场/绿洲/匹配/内鬼，分页展示）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平战绩$', fnc: 'showOverview' },
        { reg: '^#和平战绩\\s+(全部|排位|计分|地铁|地铁逃生|古墓|古墓迷途|团竞|团队竞技|巅峰|巅峰赛|全民|全民赛场|绿洲|绿洲共创|匹配|不计分|内鬼|谁是内鬼)\\s*(\\d+)?$', fnc: 'showCategory' },
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

  /** 汇总：各分类对局数（第一页条数近似） */
  async showOverview(e) {
    const got = await this.getRoleId(e)
    if (!got) return
    const { camp, roleId } = got

    await e.reply('⏳ 正在统计各分类战绩...')
    try {
      const tabs = []
      for (const t of TABS) {
        if (t.key === 'all') continue
        const res = await apiService.get_pubgbattlelist(roleId, { page: 1, pageSize: 10, tabIndex: t.tabIndex })
        if (res.returnCode !== 0) {
          e.reply(`❌ 战绩统计失败：${res.returnMsg || res.returnCode}`)
          return
        }
        const list = (res.data && res.data.list) || []
        const recent = list[0]
        let extra = ''
        if (t.type === 'metro' && recent) {
          extra = `${recent.mapDesc || ''} · 收益 ${fmtIncome(recent.income)}${recent.addFeat ? ' · ' + recent.addFeat : ''}`
        } else if (recent) {
          extra = `${recent.mapDesc || ''}${recent.teamRank ? ' · ' + recent.teamRank : ''}`
        }
        tabs.push({
          key: t.key,
          name: t.name,
          count: String(list.length),
          hasMore: Number((res.data || {}).hasMore || 0) === 1,
          recentTime: recent ? recent.playTime : '暂无',
          recentDesc: recent ? `${recent.modeDesc || t.name}${extra ? ' · ' + extra : ''}` : '—',
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

  /** 分类列表（分页）+ 地铁/古墓档案卡 */
  async showCategory(e) {
    const m = e.msg.match(/^#和平战绩\s+(全部|排位|计分|地铁|地铁逃生|古墓|古墓迷途|团竞|团队竞技|巅峰|巅峰赛|全民|全民赛场|绿洲|绿洲共创|匹配|不计分|内鬼|谁是内鬼)\s*(\d+)?$/)
    const alias = m[1]
    const page = Math.min(Math.max(Number(m[2]) || 1, 1), 10)
    const tab = TABS.find((t) => t.aliases.includes(alias))
    if (!tab) return e.reply('❌ 未知战绩分类')

    const got = await this.getRoleId(e)
    if (!got) return
    const { camp, roleId } = got

    await e.reply(`⏳ 正在查询${tab.name}战绩（第 ${page} 页）...`)
    try {
      // 地铁/古墓：先拉赛季档案（列表顶部展示）
      let profile = null
      if (tab.type === 'metro') {
        const pr = await apiService.get_escaperecord(roleId)
        if (pr.returnCode === 0 && pr.data) profile = this.buildMetroProfile(pr.data)
      } else if (tab.type === 'tomb') {
        const pr = await apiService.get_losttombrecord(roleId)
        if (pr.returnCode === 0 && pr.data) profile = this.buildTombProfile(pr.data)
      }

      const res = await apiService.get_pubgbattlelist(roleId, { page, pageSize: 10, tabIndex: tab.tabIndex })
      if (res.returnCode !== 0) return e.reply(`❌ 战绩获取失败：${res.returnMsg || res.returnCode}`)
      const d = res.data || {}
      const list = d.list || []
      if (!list.length && !profile) {
        return e.reply(`📭 ${tab.name}暂无对局记录（若刚打完请稍后再试）`)
      }

      // 写入共享缓存，供 #和平战绩详情 按编号取 battleId/battleMode
      if (list.length) setBattleCache(e.user_id, roleId, list, 'all')

      const isTdm = tab.type === 'tdm'
      const isMetro = tab.type === 'metro'
      const rows = list.map((it, i) => {
        // 绿洲跑酷等无排名意义的对局：teamRank=#0 不展示
        const teamRank = it.teamRank && it.teamRank !== '#0' ? it.teamRank : ''
        return {
        idx: (page - 1) * 10 + i + 1,
        modeIcon: it.modeIcon || '',
        modeDesc: it.modeDesc || tab.name,
        mapDesc: it.mapDesc || '',
        isTdm,
        isMetro,
        // 经典行
        teamRank,
        kills: it.killingCount ?? '—',
        assists: it.assistCount ?? '—',
        damage: it.damageAmount ?? '—',
        // 团竞行
        liansha: it.lianshaNum || '',
        lianshaIcon: it.lianshaIcon || '',
        resultIcon: it.resultIcon || '',
        result: it.result || '',
        // 地铁行
        hardType: it.hardType || '',
        feat: it.feat || '',
        addFeat: it.addFeat || '',
        income: fmtIncome(it.income),
        // 评级
        ratingIcon: it.ratingIcon || '',
        ratingValue: it.ratingValue || '',
        ratingChange: it.ratingChange || '',
        isMvp: Number(it.isMvp) === 1,
        mvpIcon: it.mvpIcon || '',
        playTime: it.playTime || fmtTime(it.startime),
        hasDetail: Number(it.hasDetail || 0) === 1,
        battleId: it.battleId || '',
      }})

      const image = await puppeteer.screenshot('battlelist', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/battlelist.html',
        roleName: camp.roleName || camp.nickName || roleId,
        tabName: tab.name,
        page,
        nextPage: page + 1,
        hasMore: Number(d.hasMore || 0) === 1,
        profile,
        rows,
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply(`❌ ${tab.name}战绩查询失败：` + (err.message || err))
    }
  }

  /** 地铁赛季档案 → 展示数据 */
  buildMetroProfile(d) {
    const rec = (d.escapeRecord || [])[0] || {}
    const pro = {}
    for (const it of rec.pro || []) pro[it.k] = val(it.v)
    const subPro = {}
    for (const it of rec.subPro || []) subPro[it.k] = val(it.v)
    return {
      seasonName: d.escapeSeasonName || '',
      seasonId: d.escapeSeasonId || '',
      divName: rec.divName || '',
      divIcon: rec.divIcon || '',
      featLevel: rec.featLevel || '',
      rows: [
        { k: '场数', v: pro['场数'] ?? '—' },
        { k: 'K/D', v: pro['K/D'] ?? '—' },
        { k: '单局最高收益', v: pro['单局最高收益'] ?? '—' },
        { k: '赛季总收益', v: pro['赛季总收益'] ?? '—' },
        { k: '撤离率', v: subPro['撤离率'] ?? '—' },
        { k: '淘汰玩家', v: subPro['淘汰玩家数'] ?? '—' },
      ],
    }
  }

  /** 古墓赛季档案 → 展示数据 */
  buildTombProfile(d) {
    const rec = (d.losttombRecord || [])[0] || {}
    const pro = {}
    for (const it of rec.pro || []) pro[it.k] = val(it.v)
    const subPro = {}
    for (const it of rec.subPro || []) subPro[it.k] = val(it.v)
    return {
      seasonName: d.losttombSeasonName || '',
      seasonId: d.losttombSeasonId || '',
      divName: rec.divName || '',
      divIcon: rec.divIcon || '',
      rows: [
        { k: '场数', v: pro['场数'] ?? '—' },
        { k: '古金币总收益', v: pro['古金币总收益'] ?? '—' },
        { k: '轮回石总收益', v: pro['轮回石总收益'] ?? '—' },
        { k: '古金币最高单局', v: subPro['古金币最高单局'] ?? '—' },
        { k: '轮回石最高单局', v: subPro['轮回石最高单局'] ?? '—' },
      ],
    }
  }
}
