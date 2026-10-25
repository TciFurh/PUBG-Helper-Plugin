import fs from 'node:fs'
import path from 'node:path'
import fetch from 'node-fetch'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { requireCamp } from '../utils/storage.js'
import Button from '../utils/button.js'


const apiService = new ApiService()

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

export class AssetAndSign extends plugin {
  constructor() {
    super({
      name: '[PHP]资产与签到',
      dsc: '查询营地仓库资产 + 每日签到（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#?和平资产(\\s+\\S+){0,3}$', fnc: 'showAsset' },
        { reg: '^#?和平签到$', fnc: 'dailySignin' },
      ],
    })
  }

  // ---- 资产查询 ----
  // #和平资产                → 分类文本菜单（不出图）
  // #和平资产 时装           → 时装（默认只显示套装，品质从高到低）
  // #和平资产 时装 角色      → 指定子分类
  // #和平资产 紫/粉色        → 品质过滤；#和平资产 时装 粉色 → 组合过滤
  async showAsset(e) {
    const argStr = String(e.msg || '').replace(/^#和平资产\s*/, '').trim()
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

  // ---- 每日签到 ----
  async dailySignin(e) {
    await e.reply('⏳ 正在执行每日签到...')
    const camp = requireCamp(e)
    if (!camp) return

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const res = await apiService.get_act_dailysigninmonthly(roleId)
      const code = res.returnCode

      let tone = 'ok'
      let emoji = '✅'
      let status = '签到成功'
      let note = '奖励已入账，明天 00:00 后再来'
      if (code === 0) {
        // 成功
      } else if (code === -71003) {
        tone = 'warn'
        emoji = '📅'
        status = '今天已经签过到了'
        note = '每天只能签一次，明天 00:00 刷新'
      } else {
        tone = 'err'
        emoji = '⚠️'
        status = '签到失败'
        note = res.returnMsg || '未知错误，稍后再试'
      }

      // 附加信息：资产 + 活跃度 + 今日任务（任一失败都不影响签到结果展示）
      const [coinsRes, scoreRes] = await Promise.all([
        apiService.get_user_coins().catch(() => null),
        apiService.get_score_tasklist(roleId).catch(() => null),
      ])
      const coins = (coinsRes?.data?.coins || []).map((c) => {
        const num = Number(c.num) || 0
        const name = c.name || '未知货币'
        return {
          name,
          numFmt: num.toLocaleString('en-US'),
          initial: name.slice(0, 1),
          main: /福利币/.test(name),
        }
      })
      const findCoin = (re) => coins.find((c) => re.test(c.name))?.numFmt || '-'
      const lv = scoreRes?.data?.liveness || {}
      const liveness = lv.current != null ? `${lv.current}/${lv.total ?? 100}` : '-'
      const taskList = scoreRes?.data?.taskList || []
      const taskDone = taskList.filter((t) => Number(t.status) !== 0).length
      const todayTasks = taskList.length ? `${taskDone}/${taskList.length}` : '-'

      let image = null
      try {
        image = await puppeteer.screenshot('signin', {
          tplFile: 'plugins/PUBG-Helper-Plugin/resources/signin.html',
          tone,
          emoji,
          status,
          note,
          roleName: camp.nickname || camp.roleName || camp.userName || roleId,
          roleId,
          dateText: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
          fulibi: findCoin(/福利币/),
          fragment: findCoin(/碎片/),
          liveness,
          todayTasks,
          coins,
        })
      } catch { /* 渲染失败回文本 */ }
      if (image) return e.reply([image, Button.signin()])
      // 兜底纯文本
      e.reply([status, note, `福利币：${findCoin(/福利币/)}`, `活跃度：${liveness}`].join('\n'))
    } catch (err) {
      e.reply('❌ 签到失败：' + (err.message || err))
    }
  }
}
