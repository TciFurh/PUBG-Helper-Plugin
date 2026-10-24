// 和平营地 QQ 扫码登录（页面式授权，王者营地同款方案）
// 链路：输入 QQ 号 → puppeteer 打开 m_authorize(token) → 页面出码 → 扫码 → 拦截 auth:// 回调
//   → 解析 access_token/openid → 营地 /user/login(qqconnect, uin=用户 QQ 号) 换凭证
import { getBot } from 'jiuli'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { createQQLoginSession, waitForQQLogin } from '../utils/qqPageLogin.js'
import { getCamp, saveCamp, maskToken, getUserInfo, saveUserInfo } from '../utils/storage.js'
import { saveCampAndBind } from '../utils/accounts.js'
import Button from '../utils/button.js'


export class QqLogin extends plugin {
  constructor() {
    super({
      name: '[PHP]QQ扫码登录',
      dsc: '和平营地 QQ 扫码登录(页面式授权, 需输入QQ号)',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平QQ登录$', fnc: 'startScan' },
        { reg: '^#和平QQ登录强制$', fnc: 'startScan' },
        { reg: '^#和平QQ登录取消$', fnc: 'cancelScan' },
        { reg: '^#(设置QQ|QQ设置)(\\s+(\\d{5,12}))?$', fnc: 'setQqUin' },
      ],
    })
    this._session = null
  }

  async setQqUin(e) {
    const m = String(e.msg).match(/^#(?:设置QQ|QQ设置)(?:\s+(\d{5,12}))?$/)
    const qqUin = m?.[1] || ''
    if (qqUin) {
      saveUserInfo(e.user_id, (cur) => ({ ...cur, qqUin }))
      return e.reply(`✅ 已设置 QQ 号：${qqUin}\n发送 #和平QQ登录 即可扫码登录（要换号就再发 #设置QQ 新号码）`)
    }
    const { info } = getUserInfo(e.user_id)
    return e.reply(
      info.qqUin
        ? `当前 QQ 号：${info.qqUin}\n更换请发送：#设置QQ 新号码`
        : '当前未设置 QQ 号\n请发送：#设置QQ 你的QQ号'
    )
  }

  async startScan(e) {
    if (this._session && Date.now() < this._session.expiresAt) {
      return e.reply('已有 QQ 扫码会话进行中，请先完成扫码，或发送 #和平QQ登录取消')
    }

    const camp = getCamp(e.user_id)
    if (camp) {
      await e.reply(
        `当前已有营地账号（token: ${maskToken(camp.token)}），扫同一账号会更新凭证，扫另一个账号会自动新增并绑定其角色ID。`
      )
    }

    const { info } = getUserInfo(e.user_id)
    const qqUin = info.qqUin || ''
    if (!qqUin) {
      return e.reply('未设置 QQ 号，请先发送：#设置QQ 你的QQ号')
    }
    return this._startScanFlow(e, qqUin)
  }

  async _startScanFlow(e, qqUin) {
    try {
      const session = await createQQLoginSession(e)
      this._session = { session, user: e.user_id, uin: qqUin, expiresAt: Date.now() + 3 * 60 * 1000 }

      const image = await puppeteer.screenshot('qqScan', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/qqScan.html',
        qrcodeBase64: session.qrcodeBuffer.toString('base64'),
        appName: '和平营地',
        uuid: 'QQ·' + Math.random().toString(16).slice(2, 10),
        expiresInMin: 3,
        sys: {
          scale: `style=transform:scale(1.4)`
        }
      })
      if (!image) {
        await session.close()
        this._session = null
        return e.reply('❌ 二维码渲染失败（渲染服务不可用）')
      }
      await e.reply(image)
      await e.reply(`已生成 QQ 登录二维码（账号 ${qqUin}），请用手机 QQ 扫码（3分钟内有效），扫码后在手机上点击「确认登录」。`)
      this._poll(e)
    } catch (err) {
      this._session = null
      await e.reply('❌ 生成二维码失败：' + (err?.message || err))
    }
  }

  async _poll(e) {
    const session = this._session
    if (!session) return
    try {
      const camp = await waitForQQLogin(session.session, {
        onStatusChange: () => {
          void this._notify(e, '✅ 已扫码，请在手机上点击「确认登录」')
        },
      })
      this._session = null
      const r = await saveCampAndBind(e.user_id, {
        openId: camp.openId,
        gameOpenId: camp.gameOpenId,
        userId: camp.userId,
        token: camp.token,
        seasonId: '0',
        userName: camp.userName,
        uin: camp.uin || session.uin,
        platform: 'qq',
      })
      await this._notify(e, [
        '✅ 和平营地 QQ 扫码登录成功',
        `营地账号: ${camp.userId}`,
        `昵称: ${camp.userName || '-'}`,
        `QQ号: ${camp.uin || session.uin}`,
        r.roleId ? `已绑定营地ID: ${r.camp?.userId || ''}（角色ID: ${r.roleId}）` : `已绑定营地ID: ${r.camp?.userId || ''}（角色ID未解析，可 #绑定和平 <营地ID>`,
        `当前账号数: ${r.total}（#和平账号 查看 / #切换和平账号 切换）`,
        `token: ${maskToken(camp.token)}`,
        '现在可以使用个人凭证功能（#和平主页 #和平资产 #和平签到）',
      ].join('\n'), Button.account())
    } catch (err) {
      this._session = null
      const msg = '❌ QQ 登录失败：' + (err?.message || err)
      await this._notify(e, msg)
      // 附带调试信息（私信 + 落盘）
      const debugFile = require('node:path').join(process.cwd(), 'data', 'PUBG-Helper-Plugin', 'qqLogin-debug.log')
      try {
        const fs = require('node:fs')
        const lines = fs.readFileSync(debugFile, 'utf8').trim().split('\n')
        const tail = lines.slice(-25).join('\n')
        if (tail) await this._notify(e, '📋 调试日志（最近 25 行）：\n' + tail.slice(0, 1800))
      } catch { /* 无调试日志 */ }
    }
  }

  async cancelScan(e) {
    try {
      if (this._session?.session?.close) await this._session.session.close()
    } catch { /* ignore */ }
    this._session = null
    return e.reply('已取消 QQ 扫码会话')
  }

  async _notify(e, msg) {
    try {
      if (e.group_id) {
        await getBot().sendGroupMsg('bot1', e.group_id, msg)
      } else {
        await getBot().sendPrivateMsg('bot1', e.user_id, msg)
      }
      return true
    } catch (err) {
      try { await e.reply(msg) } catch { }
      return false
    }
  }
}
