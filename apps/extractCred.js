// 和平营地凭证提取：明文输出 token 及全部登录数据（所有人可用，仅提取自己的）
import { getCamp, getUserInfo } from '../utils/storage.js'

export class ExtractCred extends plugin {
  constructor() {
    super({
      name: '[PHP]凭证提取',
      dsc: '提取营地登录 token 与其它数据（明文）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#提取凭证$', fnc: 'extract' },
        { reg: '^#提取凭证(数据|json)$', fnc: 'extractJson' },
      ],
    })
  }

  // 明文文本输出（方便复制）
  async extract(e) {
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地凭证，请先 #和平QQ登录 扫码或 #提交和平 抓包提交')

    const { info } = getUserInfo(e.user_id)
    const lines = [
      '【和平营地 凭证数据】',
      '',
      `营地ID (userId): ${camp.userId || '-'}`,
      `openId: ${camp.openId || '-'}`,
      `gameOpenId: ${camp.gameOpenId || '-'}`,
      `token: ${camp.token}`,
      `seasonId: ${camp.seasonId || '0'}`,
      '',
      `QQ号: ${camp.uin || info.qqUin || '-'}`,
      `昵称: ${camp.userName || '-'}`,
      `保存时间: ${new Date(camp.updatedAt || Date.now()).toLocaleString('zh-CN', { hour12: false })}`,
      '',
      '提示：token 时效约 60 天，失效后发送 #和平QQ登录 重新扫码即可。',
    ].join('\n')
    await e.reply(lines)
  }

  // JSON 输出（方便脚本/工具直接使用）
  async extractJson(e) {
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地凭证，请先 #和平QQ登录 扫码或 #提交和平 抓包提交')

    const { info } = getUserInfo(e.user_id)
    const payload = {
      userId: camp.userId || '',
      openId: camp.openId || '',
      gameOpenId: camp.gameOpenId || '',
      token: camp.token,
      seasonId: camp.seasonId || '0',
      uin: camp.uin || info.qqUin || '',
      userName: camp.userName || '',
      updatedAt: camp.updatedAt || 0,
    }
    await e.reply('```json\n' + JSON.stringify(payload, null, 2) + '\n```')
  }
}
