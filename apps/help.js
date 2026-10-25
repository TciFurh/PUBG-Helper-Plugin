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
                '🎮 和平插件菜单',
                '',
                '👤 账号与登录（登录后自动绑定角色ID）',
                ' #和平账号　#切换和平账号 <n>　#删除和平账号 <n>',
                ' #我的和平ID　#切换和平 <n>　#删除和平 <n>　#绑定和平 <ID>',
                ' #和平QQ登录　#和平微信登录（扫码）　#设置QQ <QQ号>',
                ' #和平登录（抓包教程）　#提交和平（凭证）　#和平凭证　#删除和平凭证',
                ' #提取凭证 [数据]（明文 / JSON 导出凭证）',
                '',
                '⚔️ 战绩',
                ' #和平战绩 [分类] [页码]　#和平战绩详情 <编号>',
                ' #和平最近战绩 [数量]　#和平周报　#和平主页 [ID]',
                ' #枪械熟练度 [武器类型]　#王牌印记',
                '',
                '💰 资产与签到',
                ' #和平资产 [分类] [品质/子分类]　#和平营地币　#和平签到',
                '',
                '🎯 任务',
                ' #和平任务（每日）　#和平任务状态',
                ' #和平周任务（手册状态）　#完成手册任务（执行）',
                ' #领取手册奖励 [编号…]　#开启/关闭和平自动任务',
                '',
                '🌐 更多',
                ' #和平资讯 [编号]　#和平访客　#和平在线好友　#和平赛事',
                ' #查看对局索引　#设置对局索引 <0-12>',
                '',
                '🔄 更新（主人）',
                ' #和平插件更新　#和平插件强制更新　#和平插件更新日志',
                '',
                '💡 图片版菜单：#和平帮助；新功能见 #和平帮助 里的「任务」分类'
            ].join('\n')

            await e.reply([menu, Button.help()])
        } catch (error) {
            await e.reply('显示帮助菜单失败，请稍后重试')
        }
    }
}