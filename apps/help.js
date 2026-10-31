import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import Button from '../utils/button.js'


export class Help extends plugin {
    constructor() {
        super({
            name: '[PHP]菜单',
            dsc: '和平精英插件菜单',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?和平(精英|英精)?(插件|plugin)?(帮助|help)$/i,
                    fnc: 'showHelp'
                },
                {
                    reg: /^#?和平(精英|英精)?(插件|plugin)?(帮助|help)文本$/i,
                    fnc: 'showHelpText'
                }
            ]
        })
    }
    async showHelp(e) {
        try {
            const image = await puppeteer.screenshot('help', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/help.html',
                sys: {
                    scale: `style=transform:scale(1.5)`
                }
            })
            e.reply([image, Button.help()])
        } catch (error) {
            await this.showHelpText(e)
        }
    }
    async showHelpText(e) {
        try {
            const menu = [
                '和平精英插件 · 命令菜单',
                '',
                '【账号与登录】',
                ' #和平QQ登录 / #和平微信登录　扫码登录',
                ' #和平账号　#切换和平账号 n　#删除和平账号 n',
                ' #我的和平ID　#切换和平 n　#绑定和平 <营地ID>',
                ' #设置QQ <号码>　#提交和平 <凭证>　#和平登录（抓包教程）',
                ' #和平凭证　#删除和平凭证　#提取凭证 [数据]',
                '',
                '【战绩】',
                ' #和平战绩 [分类] [页码]　排位/团竞/地铁/古墓/巅峰/全民/绿洲…',
                ' #和平战绩详情 <编号>　单场详情（枪械/装备/队伍/荣誉）',
                ' #和平最近战绩 [数量]　#和平周报',
                ' #枪械熟练度 [类型]　#王牌印记',
                ' #查看对局索引　#设置对局索引 <0-12>',
                '',
                '【资产与签到】',
                ' #和平资产 [分类] [品质]　时装(默认套装)/枪械/装备/战备',
                ' #和平资产 时装 粉色　品质筛选：紫 / 粉 / 红',
                ' #和平营地币',
                ' #和平签到　签到 + 营地任务 + 手册任务（积分手动领）',
                ' #和平签到 全部　名下所有已登录账号一次做完',
                '',
                '【更多】',
                ' #和平资讯 [编号]　#和平主页 [营地ID]',
                ' #和平访客　#和平在线好友　#和平赛事',
                ' #和平排行榜 [排位/团竞/地铁/古墓]　跨用户段位排行榜',
                '',
                '【更新】（主人）',
                ' #和平插件更新　#和平插件强制更新　#和平插件更新日志',
                '',
                '【详解】#和平详解 [主题]　比菜单更细的说明书',
                '提示：指令的 # 可省略；图片菜单发 #和平帮助'
            ].join('\n')

            await e.reply([menu, Button.help()])
        } catch (error) {
            await e.reply('显示帮助菜单失败，请稍后重试')
        }
    }
}