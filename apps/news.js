import { ApiService } from '../utils/api.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const apiService = new ApiService()
const TARGET_NEWS_IDS = ['561782362', '546341686'] // 同时查询的两个资讯ID

export class News extends plugin {
    constructor() {
        super({
            name: '[PHP]资讯',
            dsc: '和平精英个人资讯动态',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?(和平|和平精英)?(资讯|动态)$/i,
                    fnc: 'showNews'
                },
                {
                    reg: /^#?(?:和平|和平精英)?(?:资讯|动态)(\d{1,3})$/i,
                    fnc: 'showNewsDetail'
                }
            ]
        })
    }

    async getMergedNewsList(page = 1) {
        const [dataA, dataB] = await Promise.all([
            apiService.get_getcertusernews(TARGET_NEWS_IDS[0], page),
            apiService.get_getcertusernews(TARGET_NEWS_IDS[1], page)
        ])

        if (
            (dataA && dataA.returnCode === -30003 && dataA.returnMsg === '登录态失效，请重新登录') ||
            (dataB && dataB.returnCode === -30003 && dataB.returnMsg === '登录态失效，请重新登录')
        ) {
            return { error: '公共查询Token已失效' }
        }

        const listA = (dataA && dataA.data && Array.isArray(dataA.data.list) ? dataA.data.list : [])
        const listB = (dataB && dataB.data && Array.isArray(dataB.data.list) ? dataB.data.list : [])

        const merged = [...listA, ...listB]
        merged.sort((a, b) => {
            const ta = new Date(a.dtReleaseTime || 0).getTime()
            const tb = new Date(b.dtReleaseTime || 0).getTime()
            if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
            return tb - ta
        })

        return { list: merged, listA, listB }
    }

    async showNews(e) {
        const page = 1
        const { error, list, listA, listB } = await this.getMergedNewsList(page)
        if (error) return e.reply(error)

        const image = await puppeteer.screenshot('news', {
            tplFile: 'plugins/PUBG-Helper-Plugin/resources/news.html',
            sys: {
                scale: `style=transform:scale(2)`
            },
            list,
            listA,
            listB
        })

        return e.reply(image)
    }

    async showNewsDetail(e) {
        const match = e.msg.match(/(\d{1,3})$/)
        const index = match ? parseInt(match[1], 10) : NaN
        if (!Number.isInteger(index) || index <= 0) {
            return e.reply('请在“资讯”后跟上要查看的编号，例如：资讯5')
        }

        const { error, list } = await this.getMergedNewsList(1)
        if (error) return e.reply(error)
        if (!Array.isArray(list) || list.length === 0) {
            return e.reply('暂无资讯可查看')
        }

        const item = list[index - 1]
        if (!item) {
            return e.reply(`没有找到编号为${index}的资讯`)
        }

        const image = await puppeteer.screenshot('news_detail', {
            tplFile: 'plugins/PUBG-Helper-Plugin/resources/news_detail.html',
            sys: {
                scale: `style=transform:scale(2)`
            },
            item
        })

        return e.reply(image)
    }
}


