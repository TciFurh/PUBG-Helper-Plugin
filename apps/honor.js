import { ApiService } from '../utils/api.js'
import { getUserInfo } from '../utils/storage.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const apiService = new ApiService()

export class Honor extends plugin {
    constructor() {
        super({
            name: '[PHP]和平荣誉',
            dsc: '和平精英荣誉系统查询',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?和平(精英|英精)?荣誉$/i,
                    fnc: 'showHonor'
                },
                {
                    reg: /^#?和平(精英|英精)?荣誉\s*(.*)$/i,
                    fnc: 'showUserHonor'
                }
            ]
        })
    }

    async showHonor(e) {
        const userId = (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
        const { info } = getUserInfo(userId)

        if (!info.ids.length) {
            return e.reply('你还没有绑定任何ID，请先使用 #绑定和平+ID 绑定账号')
        }

        const currentId = info.ids[info.current]
        await this.getHonorInfo(e, currentId)
    }

    async showUserHonor(e) {
        const targetId = e.msg.replace(/^#?和平(精英|英精)?荣誉\s*/, '').trim()

        if (!/^\d+$/.test(targetId)) {
            return e.reply('请输入正确的用户ID（纯数字）')
        }

        await this.getHonorInfo(e, targetId)
    }

    async getHonorInfo(e, ID) {
        try {
            const data = await apiService.get_gethonorinfo(ID)

            const image = await puppeteer.screenshot('honor', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/honor.html',
                data: data.data
            })

            e.reply(image)
        } catch (error) {
            console.error('获取荣誉信息失败:', error)
            await e.reply('获取荣誉信息失败，请稍后重试')
        }
    }
}
