import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp, getUserInfo } from '../utils/storage.js'

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
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

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
              roleName: camp.roleName || camp.nickName || roleId,
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
    } catch (err) {
      e.reply('❌ 资产查询失败：' + (err.message || err))
    }
  }

  // ---- 每日签到 ----
  async dailySignin(e) {
    await e.reply('⏳ 正在执行每日签到...')
    const { info } = getUserInfo(e.user_id)
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const res = await apiService.get_act_dailysigninmonthly(roleId)
      const code = res.returnCode

      let status, color
      if (code === 0) {
        status = '✅ 签到成功'
        color = '#4caf50'
      } else if (code === -71003) {
        status = '已签到过（今天无需重复）'
        color = '#8a8a8a'
      } else {
        status = '签到失败：' + (res.returnMsg || '未知错误')
        color = '#e53935'
      }

      const image = await puppeteer.screenshot('signin', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/signin.html',
        status,
        color,
        roleName: camp.roleName || camp.nickName || roleId,
        roleId,
        date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 签到失败：' + (err.message || err))
    }
  }
}
