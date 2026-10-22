import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const BASE = 'https://imgcdn.gp.qq.com/images/BattleAchievements/yinji/'
const PLACEHOLDER_LEN = 5093  // CDN 对不存在的印记返回的占位图字节数
const MAX_TRY = 99            // 探测上限，防失控

export class AceBadges extends plugin {
  constructor() {
    super({
      name: '[PHP]王牌印记图鉴',
      dsc: '展示所有王牌印记图片（自动遍历至失效）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: /^#王牌印记$/i, fnc: 'aceBadges' },
      ],
    })
  }

  async aceBadges(e) {
    await e.reply('⏳ 正在遍历王牌印记图片，约需数秒...')
    const list = []
    let failed = 0
    for (let n = 1; n <= MAX_TRY; n++) {
      try {
        const resp = await fetch(`${BASE}${n}.png`)
        if (!resp.ok) {
          failed++
          if (failed >= 2) break
          continue
        }
        const buf = Buffer.from(await resp.arrayBuffer())
        // 占位图与真实图字节数不同：连续两次占位/失败即视为已遍历完
        if (buf.length === PLACEHOLDER_LEN) {
          failed++
          if (failed >= 2) break
          continue
        }
        list.push({ n, url: `${BASE}${n}.png` })
        failed = 0
      } catch {
        failed++
        if (failed >= 2) break
      }
    }
    if (!list.length) return e.reply('❌ 未能获取任何印记图片（网络或 CDN 异常）')
    const image = await puppeteer.screenshot('aceBadges', {
      tplFile: 'plugins/PUBG-Helper-Plugin/resources/aceBadges.html',
      list,
      total: list.length,
      updated: new Date().toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\//g, '/'),
    })
    e.reply(image)
  }
}
