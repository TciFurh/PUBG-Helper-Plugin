import { ApiService } from '../utils/api.js'
import { getUserInfo } from '../utils/storage.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const apiService = new ApiService()

export class MyHomepage extends plugin {
    constructor() {
        super({
            name: '[PHP]主页',
            dsc: '和平精英个人主页查询',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?和平(精英|英精)?主页(\d+)?$/i,
                    fnc: 'showMyHomepage'
                }
            ]
        })
    }

    async showMyHomepage(e) {
        let ID = (e.msg.match(/^#?和平(精英|英精)?主页(\d+)?$/i)?.[2]) || ''
        if (!ID) {
            const { info } = getUserInfo(e.user_id)
            ID = info.ids?.[info.current] || ''
        }
        if (!/^\d+$/.test(ID)) {
            await e.reply('请输入正确的用户ID（纯数字），或使用 #绑定和平+ID 先绑定')
            return
        }

        const data = await apiService.get_rolecard3(ID)
        //logger.mark(JSON.stringify(data, null, 4))
        if (data.returnCode === -30003 && data.returnMsg === '登录态失效，请重新登录') {
            return e.reply('公共查询Token已失效')
        }
        const roleCard = data.data.roleCard
        const { mainRecord = [], escapeRecord = [], losttombRecord = [], vsteamRecord = [] } = roleCard

        const { info } = getUserInfo(e.user_id)
        const idx = mainRecord[Number.isInteger(info.prefMainIndex) ? info.prefMainIndex : 0] ? (info.prefMainIndex || 0) : 0
        const chosen = mainRecord[idx] || {}

        const vsteam = vsteamRecord[0] || {}
        const escape = escapeRecord[0] || {}
        const losttomb = losttombRecord[0] || {}

        const get = (obj, arr, def = '失败') => arr.reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj) ?? def

        let honorData = {}
        try {
            const honorResponse = await apiService.get_gethonorinfo(ID)
            honorData = honorResponse.data
        } catch (error) {
            console.error('获取荣誉信息失败:', error)
            honorData = {
                highestDivUrl: '',
                wangpaiLevel: 0,
                highestDivName: '暂无数据',
                likeIcon: '',
                likeTimes: 0,
                likedHonorIcon: '',
                wangpaiIcon: '',
                wangpaiLevelName: '暂无数据',
                zywpIcon: '',
                zywpTimes: 0,
                cqwpIcon: '',
                cqwpTimes: 0,
                jswpIcon: '',
                jswpTimes: 0,
                dtdhIcon: '',
                dtdhTimes: 0,
                dtdhName: '地铁大亨',
                highestIncomeUrl: '',
                highestIncomeName: '',
                highestIncomeTimes: 0
            }
        }

        const tplData = {
            roleIcon: roleCard.roleBigIcon,
            roleName: roleCard.roleName,
            onlineText: (Number(roleCard.gameOnline) === 1) ? '游戏在线' : '游戏离线',
            onlineTextClass: (Number(roleCard.gameOnline) === 1) ? 'text-emerald-400' : 'text-zinc-500',
            level: roleCard.level,
            roleArea: roleCard.roleArea,
            roleJob: roleCard.roleJob,

            pattern: chosen.class === '创意工坊' ? '创意工坊' : `${chosen.title}-${chosen.class}`,
            divUrl: chosen.divUrl,
            rankProgressText: `${chosen.currentScore ?? 0}/${chosen.levelUpScore ?? 0}`,
            rankProgressPercent: chosen.levelProc ?? 0,
            chosenMatches: get(chosen, ['pro', 0, 'v', 'v']),
            chosenWins: get(chosen, ['pro', 1, 'v', 'v']),
            chosenTop10: get(chosen, ['pro', 2, 'v', 'v']),
            chosenKd: get(chosen, ['pro', 3, 'v', 'v']),
            chosenWinRate: get(chosen, ['subPro', 0, 'v', 'v']),
            chosenTop10Rate: get(chosen, ['subPro', 1, 'v', 'v']),
            chosenAvgKills: get(chosen, ['subPro', 2, 'v', 'v']),
            chosenAvgDamage: get(chosen, ['subPro', 3, 'v', 'v']),
            chosenAvgCrit: get(chosen, ['subPro', 4, 'v', 'v']),
            chosenAvgAssists: get(chosen, ['subPro', 5, 'v', 'v']),
            chosenAvgHeals: get(chosen, ['subPro', 6, 'v', 'v']),
            chosenAvgMove: get(chosen, ['subPro', 7, 'v', 'v']),

            teamLevelIcon: vsteam.levelIcon || '',
            teamLevelName: vsteam.levelName || '',
            teamFeatProgressText: `${vsteam.currentExp ?? 0}/${vsteam.levelUpExp ?? 0}`,
            teamFeatProgressPercent: vsteam.levelProc ?? 0,
            teamMatches: get(vsteam, ['pro', 0, 'v', 'v']),
            teamWins: get(vsteam, ['pro', 1, 'v', 'v']),
            teamWinRate: get(vsteam, ['pro', 2, 'v', 'v']),
            teamKills: get(vsteam, ['pro', 3, 'v', 'v']),
            teamDamage: get(vsteam, ['pro', 4, 'v', 'v']),

            teamExpLevelIcon: escape.divIcon || '',
            teamExpLevelName: escape.divName || '',
            teamExpProgressText: `${escape.currentFeat ?? 0}/${escape.levelUpFeat ?? 0}`,
            teamExpProgressPercent: escape.levelProc ?? 0,
            teamExpMatches: get(escape, ['pro', 0, 'v', 'v']),
            teamExpKd: get(escape, ['pro', 1, 'v', 'v']),
            teamMaxExp: get(escape, ['pro', 2, 'v', 'v']),
            teamTotalExp: get(escape, ['pro', 3, 'v', 'v']),
            teamEscapeRate: get(escape, ['subPro', 0, 'v', 'v']),
            teamKills2: get(escape, ['subPro', 1, 'v', 'v']),
            teamBanditKills: get(escape, ['subPro', 2, 'v', 'v']),
            teamMonsterKills: get(escape, ['subPro', 3, 'v', 'v']),

            tombMatches: get(losttomb, ['pro', 0, 'v', 'v']),
            tombCoinIncome: get(losttomb, ['pro', 1, 'v', 'v']),
            tombStoneIncome: get(losttomb, ['pro', 2, 'v', 'v']),
            tombCoinMaxIncome: get(losttomb, ['subPro', 0, 'v', 'v']),
            tombCoinAvgIncome: get(losttomb, ['subPro', 1, 'v', 'v']),
            tombStoneMaxIncome: get(losttomb, ['subPro', 2, 'v', 'v']),
            tombStoneAvgIncome: get(losttomb, ['subPro', 3, 'v', 'v']),
            tombKd: get(losttomb, ['subPro', 4, 'v', 'v']),
            tombPlayerKills: get(losttomb, ['subPro', 5, 'v', 'v']),
            tombBossKills: get(losttomb, ['subPro', 6, 'v', 'v']),
            tombMonsterKills: get(losttomb, ['subPro', 7, 'v', 'v']),
            tombBestIncomeName: losttomb.maxIncomeName || '暂无数据',
            tombBestIncomeIcon: losttomb.maxIncomeIcon || '',
            tombPioneerLevel: get(losttomb, ['profPro', 0, 'v', 'v']),
            tombPioneerIcon: get(losttomb, ['profPro', 0, 'v', 'bi'], ''),
            tombRangerLevel: get(losttomb, ['profPro', 1, 'v', 'v']),
            tombRangerIcon: get(losttomb, ['profPro', 1, 'v', 'bi'], ''),
            tombTaoistLevel: get(losttomb, ['profPro', 2, 'v', 'v']),
            tombTaoistIcon: get(losttomb, ['profPro', 2, 'v', 'bi'], ''),
            tombWitchDoctorLevel: get(losttomb, ['profPro', 3, 'v', 'v']),
            tombWitchDoctorIcon: get(losttomb, ['profPro', 3, 'v', 'bi'], ''),

            honorData: honorData,

            sys: {
                scale: `style=transform:scale(2)`
            }
        }

        const image = await puppeteer.screenshot('myHomepage', {
            tplFile: 'plugins/PUBG-Helper-Plugin/resources/myHomepage.html',
            ...tplData
        })

        e.reply(image)
    }
}