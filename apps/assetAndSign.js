import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp, getUserInfo } from '../utils/storage.js'
import Button from '../utils/button.js'


const apiService = new ApiService()

export class AssetAndSign extends plugin {
  constructor() {
    super({
      name: '[PHP]资产与签到',
      dsc: '查询营地仓库资产 + 每日签到（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平资产$', fnc: 'showAsset' },
        { reg: '^#和平签到$', fnc: 'dailySignin' },
      ],
    })
  }

  // ---- 资产查询（按分类拆分渲染，每张图清晰不糊） ----
  async showAsset(e) {
    await e.reply('⏳ 正在查询营地仓库资产...')
    const { info } = getUserInfo(e.user_id)
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）', Button.bind()])

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const tabs = await apiService.get_maintabs(roleId)
      const tabList = tabs.data || []
      if (!tabList.length) return e.reply('❌ 仓库分类获取失败：' + (tabs.returnMsg || '未知错误'))

      // 拉取有资产的分类详情（count>0）
      const sections = []
      for (const tab of tabList) {
        const section = { name: tab.tabName, count: tab.count, rareCnt: tab.rareCnt, groups: [] }
        if (tab.count > 0) {
          const detail = await apiService.get_depotdetail(roleId, tab.tabId)
          const groups = (detail.data && detail.data.items) || []
          section.groups = groups.filter((g) => g.items && g.items.length)
        }
        sections.push(section)
        await new Promise((r) => setTimeout(r, 120))
      }
      const hasItems = sections.some((s) => s.groups.length)
      if (!hasItems) return e.reply('仓库中暂无展示资产')

      // 每个分类单独渲染，物品超过 PER_PAGE 自动分页
      const PER_PAGE = 48
      const pages = sections
        .filter((s) => s.groups.length)
        .map((sec) => {
          const list = []
          let cur = null
          let curCount = 0
          for (const g of sec.groups) {
            let items = g.items
            while (items.length) {
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

      // 渲染全部页面，收集图片；一次 e.reply 数组合并为一条消息（多图），避免刷屏
      const updated = new Date().toLocaleString('zh-CN', {
        hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
      const images = []
      for (const { section, pages: pageList } of pages) {
        for (let i = 0; i < pageList.length; i++) {
          try {
            const image = await puppeteer.screenshot('asset', {
              tplFile: 'plugins/PUBG-Helper-Plugin/resources/asset.html',
              section: { name: section.name, rareCnt: section.rareCnt },
              groups: pageList[i].groups,
              totalCount: section.count,
              pageIndex: i + 1,
              pageTotal: pageList.length,
              roleName: camp.nickname || camp.roleName || camp.userName || roleId,
              updated,
            })
            if (image) images.push(image)
          } catch (err) {
            await e.reply('⚠️ ' + section.name + ' 第 ' + (i + 1) + ' 张渲染失败：' + (err.message || err))
          }
        }
      }

      if (!images.length) return e.reply('资产查询完成，但没有可展示的图片')

      // 每条消息最多 6 张（markdown 多图合并），发送失败逐张回退
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
      try { await e.reply(Button.assets()) } catch {}
    } catch (err) {
      e.reply('❌ 资产查询失败：' + (err.message || err))
    }
  }

  // ---- 每日签到 ----
  async dailySignin(e) {
    await e.reply('⏳ 正在执行每日签到...')
    const { info } = getUserInfo(e.user_id)
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply(['❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）', Button.bind()])

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
