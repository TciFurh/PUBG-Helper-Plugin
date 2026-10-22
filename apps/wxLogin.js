import { getBot } from 'jiuli'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { createWxLoginSession, waitForWxLogin } from '../utils/wxQrLogin.js'
import { getCamp, saveCamp, maskToken } from '../utils/storage.js'

export class WxLogin extends plugin {
    constructor() {
        super({
            name: '[PHP]扫码登录',
            dsc: '和平营地微信扫码登录',
            event: 'message',
            priority: 1,
            rule: [
                { reg: '^#和平微信登录$', fnc: 'startScan' },
                { reg: '^#和平微信登录强制$', fnc: 'startScan' },
                { reg: '^#和平微信登录取消$', fnc: 'cancelScan' }
            ]
        })
        this._session = null
    }

    // 发起扫码: 生成二维码 -> 渲染成图 -> 回复 -> 后台轮询
    async startScan(e) {
        if (this._session && Date.now() < this._session.expiresAt) {
            return e.reply('已有微信扫码会话进行中，请先完成扫码，或发送 #和平微信登录取消')
        }
        // 已有营地凭证（无论QQ还是微信登录的）必须加强制才能覆盖
        const camp = getCamp(e.user_id)
        if (camp && !/强制/.test(String(e.msg))) {
            return e.reply('当前已有营地凭证（token: ' + maskToken(camp.token) + '），覆盖请发送 #和平微信登录强制')
        }
        try {
            const session = await createWxLoginSession()
            this._session = { ...session, user: e.user_id }
            const image = await puppeteer.screenshot('scanCode', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/scanCode.html',
                qrcodeBase64: session.qrcodeBase64,
                appName: session.appName,
                uuid: session.uuid,
                expiresInMin: 3,
                sys: {
                    scale: `style=transform:scale(1.4)`
                }
            })
            if (!image) return e.reply('❌ 二维码渲染失败（渲染服务不可用）')
            await e.reply(image)
            await e.reply('已生成登录二维码，请用微信扫码（3分钟内有效），完成后我会自动保存凭证。')
            this._poll(e)
        } catch (err) {
            this._session = null
            await e.reply('❌ 生成二维码失败：' + (err?.message || err))
        }
    }

    // 后台轮询扫码结果
    async _poll(e) {
        const session = this._session
        if (!session) return
        try {
            const camp = await waitForWxLogin(session, {
                onStatusChange: (st) => {
                    if (st.statusCode === 405) {
                        void this._notify(e, '✅ 已扫码确认，正在登录营地...')
                    }
                }
            })
            this._session = null
            saveCamp(e.user_id, camp)
            const saved = getCamp(e.user_id)
            await this._notify(e, [
                '✅ 和平营地微信扫码登录成功',
                `营地ID: ${saved.userId}`,
                `账号: ${camp.userName || camp.nickname || camp.uin || '未知'}`,
                `token: ${maskToken(saved.token)}`,
                '现在可以使用个人凭证查询了。'
            ].join('\n'))
        } catch (err) {
            this._session = null
            await this._notify(e, '❌ 扫码登录失败：' + (err?.message || err))
        }
    }

    // 取消会话
    async cancelScan(e) {
        this._session = null
        return e.reply('已取消扫码会话')
    }

    // 异步推送(优先按触发会话回推, 失败回落 e.reply)
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
