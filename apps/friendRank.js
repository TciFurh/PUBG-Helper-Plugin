import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp } from '../utils/storage.js'

const apiService = new ApiService()

// 并发限制：分批查询好友荣誉，避免打爆接口
const BATCH = 4

export class FriendRank extends plugin {
  constructor() {
    super({
      name: '[PHP]好友排行',
      dsc: '好友段位/荣誉排行（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#好友排行(\d+)?$/, fnc: 'showFriendRank' },
      ],
    })
  }

  async showFriendRank(e) {
    const m = e.msg.match(/^#好友排行(\d+)?$/)
    const limit = Math.min(Math.max(parseInt(m?.[1] || '10', 10) || 10, 1), 30)
    await e.reply('⏳ 正在拉取好友列表与荣誉数据...')

    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    apiService.useCamp(camp)
    try {
      const friendsRes = await apiService.get_user_friends()
      if (friendsRes.returnCode !== 0) {
        return e.reply('❌ 好友列表获取失败：' + (friendsRes.returnMsg || friendsRes.returnCode || '未知错误'))
      }
      const friends = (friendsRes.data && friendsRes.data.list) || []
      if (!friends.length) return e.reply('好友列表为空')

      // 只对前 limit 个好友查询荣誉（列表本身已按热度/段位排序，取前 N 即最有代表性的好友）
      const targets = friends.slice(0, limit)

      const rows = []
      for (let i = 0; i < targets.length; i += BATCH) {
        const slice = targets.slice(i, i + BATCH)
        const results = await Promise.all(slice.map(async (f) => {
          try {
            const honor = await apiService.get_gethonorinfo(String(f.userId))
            return { friend: f, honor: (honor.returnCode === 0 && honor.data) || null }
          } catch {
            return { friend: f, honor: null }
          }
        }))
        rows.push(...results)
      }

      // 段位权重排序：最高段位星数/次数降序，其次点赞数
      const ranked = rows
        .map(({ friend, honor }) => {
          const h = honor || {}
          return {
            nickname: friend.nickname || '未知玩家',
            avatar: friend.avatar || '',
            online: Number(friend.appOnline) === 1,
            gameStatus: friend.gameStatus || '',
            divUrl: h.highestDivUrl || '',
            divName: h.highestDivName || '暂无段位',
            divTimes: parseInt(h.highestDivTimes, 10) || 0,
            divClass: h.highestDivClass || '',
            wpTimes: (parseInt(h.zywpTimes, 10) || 0) + (parseInt(h.cqwpTimes, 10) || 0) + (parseInt(h.jswpTimes, 10) || 0),
            qwTimes: parseInt(h.qiangwangTimes, 10) || 0,
            likeTimes: parseInt(h.likeTimes, 10) || 0,
          }
        })
        .sort((a, b) => {
          if (a.online !== b.online) return b.online - a.online
          if (b.divTimes !== a.divTimes) return b.divTimes - a.divTimes
          return b.likeTimes - a.likeTimes
        })
        .map((row, idx) => ({ rank: idx + 1, ...row }))

      const image = await puppeteer.screenshot('friendrank', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/friendrank.html',
        rows: ranked,
        total: friends.length,
        shown: ranked.length,
        roleName: camp.roleName || camp.nickName || '',
        updated: new Date().toLocaleString('zh-CN', {
          hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }),
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 好友排行失败：' + (err.message || err))
    }
  }
}
