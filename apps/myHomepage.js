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
            rule: [{
                reg: /^#?和平(精英|英精)?主页(\d+)?$/i,
                fnc: 'showMyHomepage'
            }]
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

        const data = await apiService.getMyHomepage(ID)
        const roleCard = data.data.roleCard
        const { mainRecord = [], escapeRecord = [], vsteamRecord = [] } = roleCard

        const { info } = getUserInfo(e.user_id)
        const idx = mainRecord[Number.isInteger(info.prefMainIndex) ? info.prefMainIndex : 0] ? (info.prefMainIndex || 0) : 0
        const chosen = mainRecord[idx] || {}

        const vsteam = vsteamRecord[0] || {}
        const escape = escapeRecord[0] || {}

        const get = (obj, arr, def = '失败') => arr.reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj) ?? def

        const tplData = {
            roleIcon: roleCard.roleBigIcon,
            roleName: roleCard.roleName,
            level: roleCard.level,
            roleArea: roleCard.roleArea,
            roleJob: roleCard.roleJob,

            pattern: chosen.class === '创意工坊' ? '创意工坊' : chosen.title,
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
            teamMonsterKills: get(escape, ['subPro', 3, 'v', 'v'])
        }

        const image = await puppeteer.screenshot('myHomepage', {
            tplFile: 'plugins/PUBG-Helper-Plugin/resources/myHomepage.html',
            ...tplData
        })

        e.reply(image)
    }
}