/**
 * 战绩视图模型（纯函数，不依赖框架）
 * 把营地接口返回的原始结构归一化成模板可直接消费的形状。
 * 拆出来是为了能脱离机器人框架跑单测/预览脚本。
 */
import { val, fmtNum, fmtWan, qualityColor, promoMeta, resultText, resultTone, rowStatus } from './battleFmt.js'

/* ============ 列表 ============ */

/**
 * 单行 → 展示模型
 * 统一成「结果/排名 · 模式 · 数值1 · 数值2 · 评分 · 时间」六列，
 * 各分类只决定每列取什么，模板不再按模式分支。
 */
export function buildRow(it, tab, idx) {
  const isMetro = tab.type === 'metro' || Number(it.tabIndex) === 5
  const isTdm = Number(it.tabIndex) === 2 || Number(it.mode) === 803
  const promo = promoMeta(it.promotion)

  // #0 表示该模式无排名意义（如绿洲跑酷），不展示
  const teamRank = it.teamRank && it.teamRank !== '#0' ? it.teamRank : ''

  const row = {
    idx,
    modeIcon: it.modeIcon || '',
    mapDesc: it.mapDesc || '',
    modeDesc: it.modeDesc || tab.name,
    status: isTdm || isMetro ? rowStatus(it) : null,
    ribbon: promo,
    rankText: teamRank,
    rankColor: it.rankColor || '',
    cols: [],
    ratingIcon: '',
    ratingText: '',
    ratingTone: 'grey',
    streak: null,
    records: [],
    time: it.playTime || '',
    canReview: !!it.reviewJump,
    hasDetail: Number(it.hasDetail || 0) === 1,
  }

  if (isMetro) {
    row.cols = [
      { n: it.killingCount ?? '—', l: '击败' },
      { n: it.huntingScore ?? '—', l: '狩猎分' },
    ]
    row.ratingText = fmtWan(it.income)
    row.ratingTone = Number(it.income) < 0 ? 'red' : 'gold'
    if (it.isMaxIncome === '1') row.records.push('新纪录')
    if (Number(it.diamondIncome) > 0) row.records.push(`钻石${fmtNum(it.diamondIncome)}`)
  } else if (isTdm) {
    row.cols = [
      { n: it.killingCount ?? '—', l: `助攻 ${it.assistCount ?? 0}` },
      { n: it.ratingValue || '—', l: it.ratingChange || '积分' },
    ]
    // 评分列放连击徽章（营地 UI 同位置），不再重复展示积分变化
    if (it.lianshaNum) {
      row.streak = {
        num: it.lianshaNum,
        tone: resultTone(it.result) === 'gold' ? 'gold' : 'red',
      }
    }
  } else {
    row.cols = [
      { n: it.killingCount ?? '—', l: `伤害 ${it.damageAmount ?? 0}` },
      { n: it.ratingValue && it.ratingValue !== '0' ? it.ratingValue : '—', l: it.ratingChange || '积分' },
    ]
    row.ratingIcon = it.ratingIcon || ''
    if (Number(it.isMvp) === 1) row.records.push('MVP')
  }

  return row
}

export function buildListRows(list, tab, page) {
  return list.map((it, i) => buildRow(it, tab, (page - 1) * 10 + i + 1))
}

/** 地铁赛季档案 */
export function buildMetroProfile(d) {
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
      { k: '单局最高收益', v: fmtNum(pro['单局最高收益']) },
      { k: '赛季总收益', v: fmtNum(pro['赛季总收益']) },
      { k: '撤离率', v: subPro['撤离率'] ?? '—' },
      { k: '淘汰玩家', v: subPro['淘汰玩家数'] ?? '—' },
    ],
  }
}

/** 古墓赛季档案 */
export function buildTombProfile(d) {
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
      { k: '古金币总收益', v: fmtNum(pro['古金币总收益']) },
      { k: '轮回石总收益', v: fmtNum(pro['轮回石总收益']) },
      { k: '古金币最高单局', v: fmtNum(subPro['古金币最高单局']) },
      { k: '轮回石最高单局', v: fmtNum(subPro['轮回石最高单局']) },
    ],
  }
}

/* ============ 详情 ============ */

function block(d, type) {
  return (d.dataList || []).find((x) => x.type === type) || null
}

function infoMap(infoList) {
  const out = {}
  for (const group of infoList || []) for (const it of group) out[it.k] = it.v
  return out
}

function memberRow(m, index) {
  const info = infoMap(m.infoList)
  const stat = (k) => (info[k] === undefined ? '—' : val(info[k]))
  return {
    idx: index + 1,
    name: m.roleName || '未知玩家',
    avatar: m.roleIcon || '',
    div: m.divName || '',
    isMvp: String(m.ismvp) === '1',
    isSelf: false,
    survivalTime: m.survivalTime || '',
    evalIcon: info['评价'] && info['评价'].bi ? info['评价'].bi : '',
    evalText: stat('评价'),
    // 经典=淘汰/助攻/伤害/救援，团竞=淘汰/助攻/战损/连击
    cols: Object.keys(info)
      .filter((k) => k !== '评价')
      .slice(0, 4)
      .map((k) => ({ l: k, n: stat(k) })),
  }
}

/** 五点能力雷达 → 直接算好 SVG 坐标，模板不碰三角函数 */
function buildRadar(raw) {
  const node = raw?.radar || raw
  const items = (node?.data || [])
    .map((it) => {
      // 营地给的是 #RRGGBBAA，转成 CSS 能认的 6 位；不能直接 replace('ff') 会切坏 #FFFFFFff
      const hex = String(it.ksup?.c || '').replace(/^#/, '')
      const color = hex.length === 8 ? `#${hex.slice(0, 6)}` : hex ? `#${hex}` : ''
      return { k: it.k || '', v: Number(it.v) || 0, color }
    })
    .filter((x) => x.k)
  if (items.length < 3) return null

  const max = Number(node.max) || 100
  const CX = 130
  const CY = 100
  const R = 70
  const n = items.length
  const pt = (ratio, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180)
    return [CX + R * ratio * Math.cos(a), CY + R * ratio * Math.sin(a)]
  }
  const poly = (ratio) =>
    items.map((_, i) => pt(ratio, i).map((v) => v.toFixed(1)).join(',')).join(' ')

  return {
    max,
    // 三层网格 + 轴线，都是模板直接填的字符串
    grids: [1, 0.75, 0.5, 0.25].map((r) => poly(r)),
    axes: items.map((_, i) => {
      const [x, y] = pt(1, i)
      return { x1: CX, y1: CY, x2: x.toFixed(1), y2: y.toFixed(1) }
    }),
    shape: items
      .map((it, i) => {
        const ratio = Math.max(0.03, Math.min(1, it.v / max))
        return pt(ratio, i)
          .map((v) => v.toFixed(1))
          .join(',')
      })
      .join(' '),
    points: items.map((it, i) => {
      const ratio = Math.max(0.03, Math.min(1, it.v / max))
      const [x, y] = pt(ratio, i)
      const [lx, ly] = pt(1.32, i)
      const anchor = Math.abs(lx - CX) < 8 ? 'middle' : lx > CX ? 'start' : 'end'
      return {
        x: x.toFixed(1),
        y: y.toFixed(1),
        k: it.k,
        v: it.v,
        color: it.color,
        lx: lx.toFixed(1),
        ly: (ly + 3.5).toFixed(1),
        anchor,
      }
    }),
    cx: CX,
    cy: CY,
  }
}

/**
 * 单局详情 → 展示模型
 * 经典/地铁/超体/团竞返回的结构完全不同，这里统一归一化；
 * 模板只按「有没有这个区块」渲染，未知模式也不会空白。
 */
export function buildDetailView(d, camp = {}) {
  const isMetro = d.income !== undefined && d.hardType !== undefined
  const isTdm = d.viewType === 'vsteam' || !!block(d, 'teams')
  const isSuper = d.isSuperBody === true

  const out = {
    mapMode: d.mapMode || '',
    modeIcon: d.modeIcon || '',
    bgImage: d.bgImage || '',
    roleName: d.roleName || camp.roleName || '',
    roleIcon: d.roleIcon || '',
    playTime: d.playTime || '',
    divName: d.divName || '',
    isMetro,
    isTdm,
    isSuper,
    promo: promoMeta(d.promotion),
    resultText: resultText(d.result),
    resultTone: resultTone(d.result),
    resultDesc: d.resultDesc || '',
    hardType: d.hardType || '',
    isMvp: Number(d.isMvp) === 1,
    subLine: [d.divName || '', d.hardType || '', Number(d.isMvp) === 1 ? 'MVP' : '']
      .filter(Boolean)
      .join(' · '),
    mvpIcon: d.mvpIcon || '',
    // 段位图标（地铁用 divOriIcon/divUrl，其它模式用 divUrl）
    divIcon: d.divOriIcon || d.divUrl || '',
    // 荣誉标记：前十/前五，营地标题条右侧同款（MVP 图太大且与成员行徽章重复，不放）
    honors: [d.honorIcon, d.mvpIcon, d.rankIcon].filter(Boolean),
    radar: null,
    hero: null,
    plugins: [],
    badges: [],
    analysis: null,
    stats: [],
    income: null,
    gear: [],
    bag: [],
    bagCounts: [],
    ability: [],
    weapons: [],
    teams: [],
    team: [],
    kills: [],
    killTotal: 0,
    killer: [],
    top1: [],
  }

  /* ---- 数值条 ---- */
  if (isMetro) {
    out.stats = [
      { n: d.killingCount ?? '—', l: '总击败' },
      { n: d.killPlayerNum ?? '0', l: '击败玩家' },
      { n: d.killGangsterNum ?? '0', l: '击败匪徒' },
      { n: d.killMonsterNum ?? '0', l: '击败怪物' },
      { n: d.huntingScore ?? '—', l: '狩猎积分', sup: d.addHuntingScore || '' },
      { n: d.prestige ?? '—', l: '声望', sup: d.addPrestige || '' },
    ]
    out.income = {
      total: fmtNum(d.income),
      wan: fmtWan(d.income),
      isMax: d.isMaxIncome === '1',
      itemsWorth: fmtNum(d.itemsWorth),
      diamond: Number(d.diamondIncome) > 0 ? fmtNum(d.diamondIncome) : '',
      feat: d.feat ? fmtNum(d.feat) : '—',
      addFeat: d.addFeat || '',
      survivalTime: d.survivalTime || '',
    }
  } else if (isTdm) {
    const sides = block(d, 'teams')?.data || []
    const members = []
    for (const side of sides) for (const m of side.list || []) members.push(m)
    const self = members.find((m) => m.roleName && m.roleName === d.roleName) || members[0]
    const selfInfo = infoMap(self?.infoList)
    const pick = (k, fallback) => (selfInfo[k] !== undefined ? val(selfInfo[k]) : fallback)
    // 结果已经在标题条右上角的 chip 上，这里换成积分（营地详情页也带积分变化）
    out.stats = [
      { n: val(d.rank) != null ? `#${val(d.rank)}` : '—', l: '队伍排名' },
      { n: pick('淘汰', d.killingCount ?? '—'), l: '淘汰' },
      { n: pick('助攻', '—'), l: '助攻' },
      { n: pick('战损', '—'), l: '战损' },
      { n: d.lianshaNum || pick('连击', '—'), l: '连击' },
      { n: d.ratingValue || '—', l: '积分', sup: d.ratingChange || '' },
    ]
  } else {
    const abilityBlock = block(d, 'ability')
    const abilityList = abilityBlock?.data?.list || []
    const flat = []
    for (const group of abilityList) for (const it of group) flat.push(it)
    out.radar = buildRadar(abilityBlock?.data?.radar)
    out.ability = flat.slice(0, 6).map((it) => ({
      label: it.k || '',
      num: String(val(it.v) ?? '—'),
      sup: it.sup && it.sup.v ? it.sup.v : '',
    }))

    const rank = val(d.rank)
    out.stats = [
      { n: rank != null && rank !== '' ? `#${rank}` : '—', l: '排名' },
      { n: d.playerNum ? `${val(d.playerNum)}队` : '—', l: '参赛' },
    ]
    for (const a of out.ability.slice(0, 4)) {
      out.stats.push({ n: a.num, l: a.label, sup: a.sup })
    }
  }

  /* ---- 超体 ---- */
  if (isSuper && d.heroInfo) {
    const h = d.heroInfo
    out.hero = {
      name: h.heroName || '',
      avatar: h.selfImage || h.heroAvatar || '',
      nameCard: h.nameCard || '',
      bg: h.selfBkg || '',
      level: d.heroLevel || '',
      rating: d.heroRating != null ? fmtNum(d.heroRating) : '',
      ratingChange: d.heroRatingChange ? String(d.heroRatingChange) : '',
    }
  }
  for (const p of [...(d.heroPlugins || []), ...(d.craftPlugins || [])]) {
    out.plugins.push({ name: p.name || '', desc: p.desc || '', url: p.url || '' })
  }
  const ach = block(d, 'achievement')?.data
  if (ach && Array.isArray(ach.list)) {
    for (const b of ach.list) {
      if (b.icon || b.name) out.badges.push({ icon: b.icon || '', name: b.name || '' })
    }
  }
  const ana = block(d, 'analysis')?.data
  if (ana) {
    const pickAna = (o) => {
      const total = Number(o.total || 0)
      const list = (o.list || [])
        .filter((x) => Number(x.value) > 0)
        .map((x) => ({
          name: x.name || '',
          value: x.value,
          percent: total ? Math.max(2, Math.round((Number(x.value) / total) * 100)) : 0,
        }))
      return { total, list }
    }
    out.analysis = { damage: pickAna(ana.damage || {}), heal: pickAna(ana.heal || {}) }
  }

  /* ---- 地铁：装备 / 背包 ---- */
  if (isMetro) {
    const eqRaw = block(d, 'equipment')?.data?.list
    const eqList = Array.isArray(eqRaw) ? eqRaw : Object.values(eqRaw || {})
    out.gear = eqList.map((g) => ({
      name: g.resName || '',
      icon: g.resIcon || g.smallIcon || '',
      color: qualityColor(g.quality),
      quality: g.quality || 0,
      worth: g.worth ? fmtNum(g.worth) : '',
      parts: (g.parts || []).map((p) => ({ name: p.resName || '', icon: p.resIcon || '' })),
      affixes: (g.affixes || []).map((a) => a.name || '').filter(Boolean),
    }))

    const bagBlock = block(d, 'bag') || block(d, 'safebag')
    out.bag = (bagBlock?.data?.list || []).map((g) => ({
      name: g.resName || '',
      icon: g.smallIcon || g.resIcon || '',
      color: qualityColor(g.quality),
      quality: g.quality || 0,
      worth: g.worth ? fmtNum(g.worth) : '',
      num: g.resNum || 1,
    }))
    const counts = bagBlock?.data?.counts || {}
    out.bagCounts = Object.keys(counts)
      .map((k) => ({ color: qualityColor(k), n: counts[k] }))
      .filter((x) => Number(x.n) > 0)
  } else {
    /* ---- 经典：枪械伤害 ---- */
    const eqGroups = block(d, 'equipment')?.data?.list || []
    for (const g of eqGroups) {
      for (const w of g.list || []) {
        out.weapons.push({
          name: w.weaponName || '',
          icon: w.weaponIcon || '',
          damage: w.totaldamage ?? '—',
          hitRate: w.hitRate ?? '—',
          critRate: w.critRate ?? '—',
          parts: [
            { k: '头部', v: w.headRate ?? '0.0' },
            { k: '躯干', v: w.bodyRate ?? '0.0' },
            { k: '手部', v: w.handRate ?? '0.0' },
            { k: '四肢', v: w.limbRate ?? '0.0' },
            { k: '脚部', v: w.footRate ?? '0.0' },
          ],
        })
        if (out.weapons.length >= 8) break
      }
      if (out.weapons.length >= 8) break
    }
  }

  /* ---- 队伍 ---- */
  if (isTdm) {
    const sides = block(d, 'teams')?.data || []
    const selfName = d.roleName || ''
    out.teams = sides.map((side, si) => ({
      name: si === 0 ? '蓝方' : '红方',
      list: (side.list || []).map((m, i) => {
        const row = memberRow(m, i)
        row.isSelf = !!selfName && m.roleName === selfName
        return row
      }),
    }))
  } else {
    const teamList = block(d, 'team')?.data?.list || []
    out.team = teamList.map((m, i) => {
      const row = memberRow(m, i)
      row.isSelf = !!d.roleName && m.roleName === d.roleName
      return row
    })
  }

  /* ---- 淘汰 / 被淘汰 / 第一名队伍 ---- */
  const killsList = block(d, 'kills')?.data?.list || []
  out.killTotal = killsList.length
  out.kills = killsList.slice(0, 8).map((k) => {
    const statList = k.damageStats?.list || []
    return {
      name: k.roleName || '未知玩家',
      avatar: k.roleIcon || '',
      desc: k.killDesc || '',
      div: k.divName || '',
      privacy: k.isPrivacy === true,
      weapons: statList.slice(0, 2).map((sw) => ({
        name: sw.itemName || '',
        icon: sw.itemIcon || '',
        damage: sw.healthDamage ?? '—',
        distance: sw.hitDistance ?? '',
        vest: sw.vestDamage ?? 0,
        helmet: sw.helmetDamage ?? 0,
        ammo: sw.ammoName || '',
      })),
    }
  })

  const killerList = block(d, 'killer')?.data?.list || []
  out.killer = killerList.slice(0, 3).map((k) => ({
    name: k.roleName || '未知玩家',
    avatar: k.roleIcon || '',
    desc: k.killDesc || '',
    div: k.divName || '',
  }))

  const top1 = block(d, 'top5')?.data?.list?.[0]?.list || []
  out.top1 = top1.map((m, i) => memberRow(m, i))

  return out
}
