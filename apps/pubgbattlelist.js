import { ApiService } from '../utils/api.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const apiService = new ApiService()

export class PubgBattleList extends plugin {
    constructor() {
        super({
            name: '[PHP]战绩查询',
            dsc: '查询和平精英玩家战绩列表并生成图片',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?和平战绩(\d+)?$/i,
                    fnc: 'showBattleList'
                }
            ]
        })
    }

    async showBattleList(e) {
        let ID = (e.msg.match(/^#?和平战绩(\d+)?$/i)?.[1]) || ''
        if (!ID) {
            const { info } = getUserInfo(e.user_id)
            ID = info.ids?.[info.current] || ''
        }
        if (!/^\d+$/.test(ID)) {
            await e.reply('请输入正确的用户ID（纯数字），或使用 #绑定和平+ID 先绑定')
            return
        }

        const data = await apiService.get_getpubgbattlelist(ID)
        if (data.returnCode === -30003 && data.returnMsg === '登录态失效，请重新登录') {
            return e.reply('公共查询Token已失效')
        }

        logger.mark(JSON.stringify(data, null, 4))
        return

        const list = (data.data && Array.isArray(data.data.list)) ? data.data.list : []

        if (list.length === 0) {
            return e.reply('未找到该玩家的战绩信息')
        }

        // 生成图片并返回
        try {
            const image = await puppeteer.screenshot('pubgbattlelist', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/pubgbattlelist.html',
                sys: {
                    scale: `style=transform:scale(2)`
                },
                list,
                keyword
            })

            return e.reply(image)
        } catch (err) {
            console.error('screenshot error:', err)
            return e.reply('生成战绩图片失败')
        }
    }
}

