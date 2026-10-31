import fs from 'node:fs'
import path from 'node:path'
import fetch from 'node-fetch'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { requireCamp, getUserInfo } from '../utils/storage.js'
import { runDailyTasks, runWeeklyTasks, claimWeeklyTasks } from '../utils/dailyTask.js'
import Button from '../utils/button.js'


const apiService = new ApiService()

/** `#和平签到 全部` 的别名 */
const ALL_RE = /^(全部|所有|全部账号|所有账号|所有号|全账号|all)$/i
/** 任务状态里算作「已完成」的几档 */
const DONE_STATES = new Set(['done', 'acted', 'waitClaim'])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 品质名 → quality 值（编码整体比叫法低一级：6粉 5紫 4蓝 3绿，7红[最高档]） */
const QUALITY_NUM = {
  红: 7, 红色: 7, 红色品质: 7,
  粉: 6, 粉色: 6, 粉色品质: 6,
  紫: 5, 紫色: 5, 紫色品质: 5,
  蓝: 4, 蓝色: 4, 蓝色品质: 4,
  绿: 3, 绿色: 3, 绿色品质: 3,
}
const QUALITY_NAME = { 3: '绿色', 4: '蓝色', 5: '紫色', 6: '粉色', 7: '红色' }

/**
 * 资产图片本地缓存：首次渲染下载一次落盘，之后全部走本地，
 * 避免每次渲染都从网络拉图片（网络抖动会导致图片加载不出来）。
 */
const IMG_CACHE_DIR = path.resolve('./data/PUBG-Helper-Plugin/assetCache')

/** 返回本地缓存的图片 data URI；没有缓存就下载并落盘。失败返回 '' */
async function localImage(url, key) {
  if (!url) return ''
  const file = path.join(IMG_CACHE_DIR, key)
  try {
    const buf = fs.readFileSync(file)
    if (buf.length > 0) return 'data:image/png;base64,' + buf.toString('base64')
  } catch { }
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return ''
    try {
      fs.mkdirSync(IMG_CACHE_DIR, { recursive: true })
      fs.writeFileSync(file, buf)
    } catch { }
    return 'data:image/png;base64,' + buf.toString('base64')
  } catch {
    return ''
  }
}

/** 批量把物品图本地化（并发 8） */
async function prefetchItems(items) {
  const todo = (items || []).filter((it) => it && it.imageUrl && !it.localImg)
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async (it) => {
      it.localImg = await localImage(it.imageUrl, `item_${it.itemId}.png`)
    }))
  }
}

/**
 * 单个账号：签到 → 营地每日任务（积分+福利，含领奖）→ 手册周任务 → 领手册积分。
 * 任一步失败都不抛（除了拿不到角色ID），结果里带上错误原因，便于逐账号汇总。
 */
async function signOne(camp, { withCoins = false } = {}) {
  const api = new ApiService()
  api.useCamp(camp)
  const who = camp.nickname || camp.roleName || camp.userName || camp.userId || '未知账号'
  const r = {
    who, roleId: '', tone: 'ok', emoji: '✅', status: '签到成功',
    note: '奖励已入账，明天 00:00 后再来', signState: 'ok',
    tasks: [], taskNote: '', rewardsText: '',
    liveness: '-', todayTasks: '-', fulibi: '-', fragment: '-', coins: [],
    daily: null, weekly: null, claim: null,
    dailyErr: '', weeklyErr: '', claimErr: '',
    acted: 0, numDone: 0, numTotal: 0,
  }

  const roleId = await api.get_self_role_id()
  if (!roleId) throw new Error('未能获取营地角色ID（凭证可能已失效）')
  r.roleId = String(roleId)

  // 1) 签到
  try {
    const res = await api.get_act_dailysigninmonthly(roleId)
    const code = res.returnCode
    if (code === -71003) {
      r.tone = 'warn'; r.emoji = '📅'; r.status = '今天已经签过到了'
      r.note = '每天只能签一次，明天 00:00 刷新'; r.signState = 'done'
    } else if (code !== 0) {
      r.tone = 'err'; r.emoji = '⚠️'; r.status = '签到失败'
      r.note = res.returnMsg || `错误码 ${code}`; r.signState = 'fail'
    }
  } catch (err) {
    r.tone = 'err'; r.emoji = '⚠️'; r.status = '签到失败'
    r.note = err.message || String(err); r.signState = 'fail'
  }

  // 2) 营地每日任务（积分任务 + 福利任务，内部已含领奖）
  try {
    r.daily = await runDailyTasks(api, roleId)
  } catch (err) {
    r.dailyErr = err.message || String(err)
  }

  // 3) 手册周任务 + 领取手册积分（签到即完成，不再留着待领）
  try {
    r.weekly = await runWeeklyTasks(api, roleId)
    try {
      const c = await claimWeeklyTasks(api, roleId, null)
      if (c && c.total) r.claim = c
    } catch (err) {
      r.claimErr = err.message || String(err)
    }
  } catch (err) {
    r.weeklyErr = err.message || String(err)
  }

  // ---- 汇总卡片数据 ----
  const score = r.daily?.score || []
  const welfare = r.daily?.welfare || []
  const wRows = (r.weekly?.weeks || []).flatMap((w) => w.rows || [])
  const scoreDone = score.filter((x) => DONE_STATES.has(x.status)).length
  const welfareDone = welfare.filter((x) => DONE_STATES.has(x.status)).length
  const weeklyDone = wRows.filter((x) => DONE_STATES.has(x.status)).length
  const waitWeekly = (r.weekly?.waitClaim || []).length
  const pts = (r.claim?.claimed || []).reduce((s, c) => s + (c.point || 0), 0)
  const toneOf = (done, total) => (total ? (done >= total ? 'good' : '') : '')

  r.tasks = [
    {
      name: '营地每日任务',
      value: score.length ? `${scoreDone}/${score.length}` : (r.dailyErr ? '失败' : '—'),
      tone: r.dailyErr ? 'bad' : toneOf(scoreDone, score.length),
    },
    {
      name: '福利中心任务',
      value: welfare.length ? `${welfareDone}/${welfare.length}` : (r.dailyErr ? '失败' : '—'),
      tone: r.dailyErr ? 'bad' : toneOf(welfareDone, welfare.length),
    },
    {
      name: '手册周任务',
      value: wRows.length ? `${weeklyDone}/${wRows.length}` : (r.weeklyErr ? '失败' : '—'),
      tone: r.weeklyErr ? 'bad' : toneOf(weeklyDone, wRows.length),
    },
    {
      name: '手册积分',
      value: r.claim ? `领到 ${r.claim.total} 项` : (r.claimErr ? '领取失败' : (waitWeekly ? `${waitWeekly} 项待领` : '无待领')),
      tone: r.claim ? 'good' : (r.claimErr ? 'bad' : ''),
    },
  ]

  const rewards = r.daily?.rewards || []
  r.rewardsText = rewards.join('、')
  r.acted = (r.daily?.welfareActed || 0)
    + score.filter((x) => x.status === 'acted').length
    + (r.weekly?.acted || 0)
  r.numDone = scoreDone + welfareDone + weeklyDone
  r.numTotal = score.length + welfare.length + wRows.length
  r.pointGot = pts
  const bits = []
  if (r.acted) bits.push(`本次自动完成 ${r.acted} 项`)
  if (r.claim?.total) bits.push(`领手册积分 ${pts} 分`)
  if (rewards.length) bits.push(`营地奖励 ${rewards.length} 份`)
  r.taskNote = bits.join(' · ') || '今日任务均已处理'

  // 4) 活跃度 / 今日积分任务（直接复用任务视图，不再额外请求）
  r.liveness = r.daily?.liveness ?? '-'
  r.todayTasks = score.length ? `${scoreDone}/${score.length}` : '-'

  // 5) 货币（仅单账号卡需要）
  if (withCoins) {
    const coinsRes = await api.get_user_coins().catch(() => null)
    r.coins = (coinsRes?.data?.coins || []).map((c) => {
      const num = Number(c.num) || 0
      const name = c.name || '未知货币'
      return {
        name,
        numFmt: num.toLocaleString('en-US'),
        initial: name.slice(0, 1),
        main: /福利币/.test(name),
      }
    })
    const findCoin = (re) => r.coins.find((c) => re.test(c.name))?.numFmt || '-'
    r.fulibi = findCoin(/福利币/)
    r.fragment = findCoin(/碎片/)
  }

  return r
}

/** 单账号结果 → 纯文本兜底 */
function describeSignin(r) {
  const lines = [`${r.emoji} ${r.who} · ${r.status}`, r.note]
  for (const t of r.tasks) lines.push(`· ${t.name}：${t.value}`)
  if (r.rewardsText) lines.push(`🎁 领到：${r.rewardsText}`)
  if (r.dailyErr) lines.push(`⚠️ 营地任务失败：${r.dailyErr}`)
  if (r.weeklyErr) lines.push(`⚠️ 手册任务失败：${r.weeklyErr}`)
  if (r.claimErr) lines.push(`⚠️ 手册积分领取失败：${r.claimErr}`)
  return lines.join('\n')
}

export class AssetAndSign extends plugin {
  constructor() {
    super({
      name: '[PHP]资产与签到',
      dsc: '查询营地仓库资产 + 每日签到（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#?和平资产(\\s+\\S+){0,3}$', fnc: 'showAsset' },
        { reg: '^#?和平签到(\\s+\\S+)?$', fnc: 'dailySignin' },
      ],
    })
    /** 签到/任务全流程同一时间只跑一份，避免并发打爆接口 */
    this.running = false
  }

  // ---- 资产查询 ----
  // #和平资产                → 分类文本菜单（不出图）
  // #和平资产 时装           → 时装（默认只显示套装，品质从高到低）
  // #和平资产 时装 角色      → 指定子分类
  // #和平资产 紫/粉色        → 品质过滤；#和平资产 时装 粉色 → 组合过滤
  async showAsset(e) {
    const argStr = String(e.msg || '').replace(/^#?和平资产\s*/, '').trim()
    const args = argStr ? argStr.split(/\s+/).filter(Boolean) : []
    const qualityArg = args.find((a) => QUALITY_NUM[a]) || ''
    const q = qualityArg ? QUALITY_NUM[qualityArg] : 0
    const rest = args.filter((a) => a !== qualityArg)
    const catFilter = rest[0] || ''
    const subFilter = rest[1] || ''
    const camp = requireCamp(e)
    if (!camp) return

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const tabs = await apiService.get_maintabs(roleId)
      const tabList = tabs.data || []

      // ---- 无参数：只给分类文本菜单（不生成图片） ----
      if (!args.length) {
        const lines = ['🧭 和平资产 · 选择分类（发对应指令查看）', '']
        for (const t of tabList) {
          lines.push(`· ${t.tabName}（${t.count} 件${t.rareCnt ? ` · 稀有 ${t.rareCnt}` : ''}）`)
        }
        lines.push(
          '',
          '用法：',
          '· #和平资产 时装　（默认只显示套装，品质从高到低）',
          '· #和平资产 时装 角色　指定子分类',
          '· #和平资产 时装 粉色　按品质筛选',
          '· #和平资产 紫色　全分类按品质筛选',
        )
        return e.reply([lines.join('\n'), segment.button([
          [{ text: '时装', callback: '#和平资产 时装' }, { text: '枪械', callback: '#和平资产 枪械' }, { text: '装备', callback: '#和平资产 装备' }],
          [{ text: '战备', callback: '#和平资产 战备' }, { text: '紫色', callback: '#和平资产 紫色' }, { text: '粉色', callback: '#和平资产 粉色' }],
        ])])
      }

      let useTabs = tabList
      if (catFilter) useTabs = tabList.filter((t) => String(t.tabName).includes(catFilter))
      if (!useTabs.length) {
        return e.reply(`❌ 没有匹配「${catFilter}」的分类\n可用分类：${tabList.map((t) => t.tabName).join(' / ')}\n品质过滤：#和平资产 紫 / 粉 / 红`)
      }

      // ---- 货币 / 收藏家 / 热力值（图片第一张展示） ----
      let currencies = []
      let collect = null
      let spark = null
      try {
        const c = await apiService.get_charmandcoins(roleId)
        const d = c.data || {}
        currencies = [
          { name: '点券', value: Number(d.ticket) || 0 },
          { name: '荣耀勋章', value: Number(d.ironCoin) || 0 },
          { name: '幸运币', value: Number(d.luckyCoin) || 0 },
          { name: '战备积分', value: Number(d.universalScore) || 0 },
          { name: '物资币', value: Number(d.itemCoin) || 0 },
          { name: '服饰币', value: Number(d.diamond) || 0 },
          { name: '金币', value: Number(d.gold) || 0 },
        ]
        if (d.collectData && d.collectData.collectName) {
          collect = { ...d.collectData }
          collect.localIcon = await localImage(collect.collectIcon, `collect_${collect.growthCollectLevel || 0}.png`)
        }
        if (d.totalCharm != null) spark = Number(d.totalCharm) || null
      } catch { }

      const sections = []
      for (const tab of useTabs) {
        const section = { name: tab.tabName, count: tab.count, rareCnt: tab.rareCnt, groups: [] }
        if (tab.count > 0) {
          const detail = await apiService.get_depotdetail(roleId, tab.tabId)
          let groups = (detail.data && detail.data.items) || []
          // 默认子分类：时装只显示「套装」；显式指定子分类优先
          const wantSub = subFilter || (String(tab.tabName) === '时装' ? '套装' : '')
          if (wantSub) groups = groups.filter((g) => String(g.tabName).includes(wantSub))
          if (q) {
            groups = groups.map((g) => ({ ...g, items: (g.items || []).filter((it) => Number(it.quality) === q) }))
          }
          // 品质从高到低排序（同品质按名称）
          groups = groups.map((g) => ({
            ...g,
            items: (g.items || []).slice().sort((a, b) => (Number(b.quality) || 0) - (Number(a.quality) || 0)
              || String(a.itemName).localeCompare(String(b.itemName), 'zh')),
          }))
          groups = groups.filter((g) => g.items && g.items.length)
          section.groups = groups
          if (wantSub || q) {
            section.count = groups.reduce((n, g) => n + g.items.length, 0)
            section.rareCnt = groups.reduce((n, g) => n + g.items.filter((it) => Number(it.quality) >= 6).length, 0)
            if (wantSub && subFilter) section.name = `${tab.tabName}·${wantSub}`
          }
        }
        sections.push(section)
        await new Promise((r) => setTimeout(r, 120))
      }
      const hasItems = sections.some((s) => s.groups.length)
      if (!hasItems) {
        if (q) return e.reply(`没有${QUALITY_NAME[q]}品质的展示资产（过滤条件：${argStr}）`)
        return e.reply('仓库中暂无展示资产')
      }

      // ---- 分页：每页 48 件，单分类最多渲染 3 页（避免图片过多） ----
      const PER_PAGE = 48
      const MAX_PAGES = 3
      const pages = sections
        .filter((s) => s.groups.length)
        .map((sec) => {
          const list = []
          let cur = null
          let curCount = 0
          for (const g of sec.groups) {
            let items = g.items
            while (items.length && list.length < MAX_PAGES) {
              const take = Math.min(items.length, PER_PAGE - curCount)
              if (!cur) { cur = { groups: [] }; list.push(cur) }
              cur.groups.push({ tabName: g.tabName, items: items.slice(0, take) })
              curCount += take
              items = items.slice(take)
              if (curCount >= PER_PAGE) { cur = null; curCount = 0 }
            }
          }
          return { section: sec, pages: list }
        })

      const updated = new Date().toLocaleString('zh-CN', {
        hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
      const roleName = camp.nickname || camp.roleName || camp.userName || roleId
      const sectionName = q ? `${QUALITY_NAME[q]}品质` : (catFilter ? (subFilter ? `${catFilter}·${subFilter}` : catFilter) : '全部分类')
      const filterNote = [
        catFilter && !q ? `分类「${catFilter}」` : '',
        q ? `${QUALITY_NAME[q]}品质` : '',
        subFilter ? `子分类「${subFilter}」` : '',
      ].filter(Boolean).join(' · ')

      const images = []
      for (const { section, pages: pageList } of pages) {
        for (let i = 0; i < pageList.length; i++) {
          const pageItems = pageList[i].groups.flatMap((g) => g.items)
          await prefetchItems(pageItems)   // 图片本地化（已缓存的不再下载）
          try {
            const img = await puppeteer.screenshot('asset', {
              tplFile: 'plugins/PUBG-Helper-Plugin/resources/asset.html',
              section: { name: sectionName, rareCnt: section.rareCnt },
              groups: pageList[i].groups,
              totalCount: section.count,
              filterNote,
              currencies: i === 0 ? currencies : [],
              collect: i === 0 ? collect : null,
              spark: i === 0 ? spark : null,
              pageIndex: i + 1,
              pageTotal: pageList.length,
              roleName,
              updated,
            })
            if (img) images.push(img)
          } catch (err) {
            await e.reply('⚠️ ' + section.name + ' 第 ' + (i + 1) + ' 张渲染失败：' + (err.message || err))
          }
        }
      }
      if (!images.length) return e.reply('资产查询完成，但没有可展示的图片')

      const BATCH = 6
      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH)
        try {
          await e.reply(batch)
        } catch (err) {
          for (const image of batch) {
            try { await e.reply(image) } catch { /* 单张也失败则跳过 */ }
          }
        }
      }
      if (sections.some((s) => s.count > MAX_PAGES * PER_PAGE)) {
        await e.reply(`📦 该分类共 ${sections.reduce((n, s) => n + s.count, 0)} 件，仅显示前 ${MAX_PAGES * PER_PAGE} 件\n加品质可缩小范围，如「#和平资产 ${catFilter || '时装'} 粉色」`)
      }
      try {
        await e.reply(segment.button([
          [{ text: '紫色', callback: `#和平资产 ${catFilter ? catFilter + ' ' : ''}紫色` }, { text: '粉色', callback: `#和平资产 ${catFilter ? catFilter + ' ' : ''}粉色` }, { text: '红色', callback: `#和平资产 ${catFilter ? catFilter + ' ' : ''}红色` }],
          [{ text: '返回分类', callback: '#和平资产' }],
        ]))
      } catch { }
    } catch (err) {
      e.reply('❌ 资产查询失败：' + (err.message || err))
    }
  }

  // ---- 每日签到（签到 + 营地任务 + 手册任务，一次跑完） ----
  // #和平签到        → 当前账号
  // #和平签到 全部   → 名下所有已登录账号
  async dailySignin(e) {
    const arg = String(e.msg || '').replace(/^#?和平签到\s*/, '').trim()
    if (ALL_RE.test(arg)) return this.signAll(e)
    if (arg) {
      return e.reply([
        `❌ 不认识「${arg}」这个参数`,
        '用法：',
        '· #和平签到　只做当前账号',
        '· #和平签到 全部　名下所有已登录账号一起做',
      ])
    }

    const camp = requireCamp(e)
    if (!camp) return
    if (this.running) return e.reply('⏳ 上一个签到任务还在跑，稍等一下再发')

    this.running = true
    await e.reply('⏳ 正在签到，并自动完成营地每日任务与手册周任务...')
    try {
      const r = await signOne(camp, { withCoins: true })
      let image = null
      try {
        image = await puppeteer.screenshot('signin', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/signin.html',
          tone: r.tone,
          emoji: r.emoji,
          status: r.status,
          note: r.note,
          roleName: r.who,
          roleId: r.roleId,
          dateText: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
          fulibi: r.fulibi,
          fragment: r.fragment,
          liveness: r.liveness,
          todayTasks: r.todayTasks,
          coins: r.coins,
          tasks: r.tasks,
          taskNote: r.taskNote,
          rewardsText: r.rewardsText,
        })
      } catch { /* 渲染失败回文本 */ }
      if (image) return await e.reply([image, Button.signin()])
      await e.reply([describeSignin(r), Button.signin()])
    } catch (err) {
      await e.reply('❌ 签到失败：' + (err.message || err))
    } finally {
      this.running = false
    }
  }

  /** `#和平签到 全部`：名下所有已登录（有 token）的营地账号逐个跑 */
  async signAll(e) {
    const { info } = getUserInfo(e.user_id)
    const camps = (info.camps || []).filter((c) => c && c.token)
    if (!camps.length) {
      return e.reply(['❌ 名下还没有已登录的营地账号', '· 扫码登录：#和平QQ登录 或 #和平微信登录', Button.bind()])
    }
    if (this.running) return e.reply('⏳ 上一个签到任务还在跑，稍等一下再发')

    this.running = true
    await e.reply(`⏳ 开始为 ${camps.length} 个账号执行「签到 + 营地任务 + 手册任务」，逐个进行，请稍等...`)
    try {
      const results = []
      for (let i = 0; i < camps.length; i++) {
        const camp = camps[i]
        try {
          results.push(await signOne(camp))
        } catch (err) {
          results.push({
            who: camp.nickname || camp.roleName || camp.userName || camp.userId || '未知账号',
            roleId: String(camp.roleId || ''),
            failed: true,
            err: err.message || String(err),
          })
        }
        if (i < camps.length - 1) {
          // 单个账号要跑 1~2 分钟，中途报个进度，免得用户以为卡住
          const cur = results[results.length - 1]
          const tip = cur.failed ? '执行失败' : `${cur.status} · 任务 ${cur.numDone}/${cur.numTotal}`
          await e.reply(`[${i + 1}/${camps.length}] ${cur.who} ${tip}`).catch(() => { })
          await sleep(800)
        }
      }

      // 汇总
      const okRows = results.filter((r) => !r.failed)
      const signOk = okRows.filter((r) => r.signState === 'ok').length
      const signDone = okRows.filter((r) => r.signState === 'done').length
      const totalTask = okRows.reduce((n, r) => n + r.numTotal, 0)
      const doneTask = okRows.reduce((n, r) => n + r.numDone, 0)
      const pointSum = okRows.reduce((n, r) => n + (r.pointGot || 0), 0)

      const rows = results.map((r, i) => ({
        no: i + 1,
        name: r.who,
        roleId: r.roleId || '—',
        signText: r.failed ? '执行失败' : r.status,
        signTone: r.failed || r.signState === 'fail' ? 'bad' : (r.signState === 'done' ? 'warn' : 'good'),
        taskText: r.failed ? '—' : `${r.numDone}/${r.numTotal}`,
        taskTone: r.failed ? 'bad' : (r.numTotal && r.numDone >= r.numTotal ? 'good' : ''),
        pointText: r.failed ? '—' : (r.pointGot ? `+${r.pointGot}分` : '—'),
        note: r.failed ? (r.err || '') : (r.taskNote || ''),
      }))

      const data = {
        total: results.length,
        signOk,
        signDone,
        fail: results.length - okRows.length,
        taskRate: totalTask ? `${doneTask}/${totalTask}` : '—',
        pointSum,
        rows,
        dateText: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      }

      let image = null
      try {
        image = await puppeteer.screenshot('signinAll', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/signinAll.html',
          ...data,
        })
      } catch { /* 渲染失败回文本 */ }
      if (image) return await e.reply([image, Button.signin()])

      // 文本兜底
      const lines = [
        `📅 签到全部完成：${results.length} 个账号`,
        `· 签到成功 ${signOk} · 今天已签 ${signDone} · 失败 ${data.fail}`,
        `· 任务完成 ${data.taskRate}${pointSum ? ` · 手册积分 +${pointSum}` : ''}`,
        '',
      ]
      for (const row of rows) {
        lines.push(`${row.no}. ${row.name}｜${row.signText}｜任务 ${row.taskText}${row.pointText !== '—' ? `｜${row.pointText}` : ''}`)
        if (row.note && row.note !== '今日任务均已处理') lines.push(`   ${row.note}`)
      }
      await e.reply([lines.join('\n'), Button.signin()])
    } catch (err) {
      await e.reply('❌ 批量签到失败：' + (err.message || err))
    } finally {
      this.running = false
    }
  }
}
