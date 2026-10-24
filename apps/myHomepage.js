import { ApiService } from '../utils/api.js'
import Button from '../utils/button.js'

import { getUserInfo } from '../utils/storage.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const apiService = new ApiService()

// 区服平台图标（本地资源，避免外网依赖）
function iconDataUri(rel) {
    try {
        const buf = readFileSync(fileURLToPath(new URL(rel, import.meta.url)))
        return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
        return ''
    }
}
const ICON_QQ = iconDataUri('../resources/icons/qq.png')
const ICON_WECHAT = iconDataUri('../resources/icons/wechat.png')
const ICON_ANDROID = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1a1a1a" d="M6.6 4.6L4.9 1.7c-.2-.4-.6-.5-1-.3-.4.2-.5.6-.3 1l1.8 2.9C3.9 6.4 3 8.1 3 10.2h18c0-2.1-.9-3.8-2.4-4.9L20.4 2.4c.2-.4.1-.8-.3-1-.4-.2-.8-.1-1 .3l-1.7 2.9C16.4 4.2 15.3 4 14 4s-2.4.2-3.4.6zM7.4 6c.8 0 1.4.6 1.4 1.4S8.2 8.8 7.4 8.8 6 8.2 6 7.4 6.6 6 7.4 6zm9.2 0c.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4-1.4-.6-1.4-1.4S15.8 6 16.6 6zM5 11.7h1.7v5.8H5c-.6 0-1-.4-1-1v-3.8c0-.6.4-1 1-1zm12.3 0H19c.6 0 1 .4 1 1v3.8c0 .6-.4 1-1 1h-1.7v-5.8zM7.2 11.7h9.6v5.9c0 .6-.4 1-1 1h-1v3.4c0 .6-.4 1-1 1s-1-.4-1-1v-3.4h-1.6v3.4c0 .6-.4 1-1 1s-1-.4-1-1v-3.4h-1c-.6 0-1-.4-1-1v-5.9z"/></svg>')}`
const ICON_APPLE = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1a1a1a" d="M17.05 12.54c-.02-2.16 1.77-3.2 1.85-3.25-1.01-1.47-2.57-1.67-3.13-1.69-1.33-.13-2.6.78-3.28.78-.68 0-1.72-.76-2.83-.74-1.45.02-2.79.84-3.54 2.14-1.51 2.62-.39 6.49 1.08 8.62.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.82-.7s1.69.7 2.84.68c1.17-.02 1.91-1.06 2.63-2.1.83-1.21 1.17-2.39 1.19-2.45-.03-.01-2.28-.88-2.3-3.46zM14.61 5.06c.6-.72 1-1.73.89-2.73-.86.03-1.9.57-2.52 1.29-.55.64-1.04 1.67-.91 2.66.96.07 1.94-.49 2.54-1.22z"/></svg>')}`

function formatTime(ts) {
    const d = new Date(Number(ts) * 1000)
    if (isNaN(d.getTime())) return '暂无'
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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
        const arg = (e.msg.match(/^#?和平(精英|英精)?主页(\d+)?$/i)?.[2]) || ''
        let ID = arg
        const { info } = getUserInfo(e.user_id)
        if (!ID) {
            // rolecard3 的 friendUserId 要的是营地ID（不是角色ID，传角色ID会报「该用户暂无角色」）
            ID = info.camp?.userId || info.ids?.[info.current] || ''
        }
        apiService.useCamp(info.camp || null)
        if (!/^\d+$/.test(ID)) {
            await e.reply('请输入正确的用户ID（纯数字），或使用 #绑定和平+ID 先绑定')
            return
        }

        let data = await apiService.get_rolecard3(ID)
        // 未带参数的自查：如果回落到了角色ID（老数据没存营地ID），报 -30087 时用当前营地账号的营地ID再试一次
        if (!arg && Number(data.returnCode) === -30087 && info.camp?.userId && String(ID) !== String(info.camp.userId)) {
            ID = String(info.camp.userId)
            data = await apiService.get_rolecard3(ID)
        }
        //logger.mark(JSON.stringify(data, null, 4))
        if (data.returnCode === -30003 && data.returnMsg === '登录态失效，请重新登录') {
            return e.reply('公共查询Token已失效')
        }
        if (Number(data.returnCode) !== 0 || !data.data?.roleCard) {
            return e.reply('❌ 主页查询失败：' + (data.returnMsg || `没有查到 ${ID} 的主页数据`) + '\n提示：#和平主页 需要营地ID（营地APP「我的」页面那串数字）')
        }
        const roleCard = data.data.roleCard
        const { mainRecord = [], escapeRecord = [], losttombRecord = [], vsteamRecord = [] } = roleCard

        const idx = mainRecord[Number.isInteger(info.prefMainIndex) ? info.prefMainIndex : 0] ? (info.prefMainIndex || 0) : 0
        const chosen = mainRecord[idx] || {}

        const vsteamTrad = vsteamRecord[0] || {}
        const vsteamRanked = vsteamRecord[1] || {}
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
                highestIncomeTimes: 0,
                highestVsTeamDivName: '',
                highestVsTeamDivUrl: '',
                highestHuntingDivName: '',
                highestHuntingDivUrl: '',
                highestHuntingSeason: '',
                highestHuntingValue: 0,
                losttombHighestCombatPower: 0,
                losttombHighestProfessionName: '',
                losttombHighestProfessionIcon: '',
                highestDivClass: '',
                // 古墓/目标/团竞印记兜底
                xmbIcon: '', xmbName: '', xmbTimes: 0,
                zmbIcon: '', zmbName: '', zmbTimes: 0,
                dmbIcon: '', dmbName: '', dmbTimes: 0,
                cfzyIcon: '', cfzyName: '财富自由', cfzyTimes: 0,
                csxlIcon: '', csxlName: '财神显灵', csxlTimes: 0,
                fkdgIcon: '', fkdgName: '富可敌国', fkdgTimes: 0,
                jbpIcon: '', jbpName: '聚宝盆', jbpTimes: 0,
                jsyhIcon: '', jsyhName: '金山银海', jsyhTimes: 0,
                qiangwangIcon: '', qiangwangName: '枪王印记', qiangwangTimes: 0,
                vsteamGungodRankIcon: '',
                likedValue: 0
            }
        }

        const tplData = {
            roleIcon: roleCard.roleBigIcon,
            roleName: roleCard.roleName,
            onlineText: (Number(roleCard.gameOnline) === 1) ? '游戏在线' : '游戏离线',
            onlineTextClass: (Number(roleCard.gameOnline) === 1) ? 'bg-emerald-500 text-white' : 'bg-zinc-600 text-zinc-300',
            level: roleCard.level,
            roleArea: roleCard.roleArea,
            roleJob: roleCard.roleJob,

            // ---- 区服平台图标（微信/QQ × 苹果/安卓） ----
            areaChannelIcon: (roleCard.areaName || roleCard.roleArea || '').includes('微信') ? ICON_WECHAT : ICON_QQ,
            areaDeviceIcon: (roleCard.areaServerText || '').includes('苹果') ? ICON_APPLE : ICON_ANDROID,

            // ---- 新增: 赛季 / 注册 / 最近战斗 / 荣誉等级 / 历史最高分 ----
            seasonName: roleCard.seasonName || '',
            seasonIcon: roleCard.seasonIcon || '',
            registerTime: (roleCard.roleTime || '').slice(0, 10),
            lastBattle: roleCard.lastBattleTime ? formatTime(roleCard.lastBattleTime) : '暂无',
            honorLevel: roleCard.honorLevel ?? 0,
            hisMaxSegmentLevel: roleCard.hisMaxSegmentLevel ?? 0,

            // ---- 新增: 团竞最高段位 / 猎场最高段位 / 地铁最高战力·职业 ----
            vsTeamHighestName: honorData.highestVsTeamDivName || '暂无',
            vsTeamHighestIcon: honorData.highestVsTeamDivUrl || '',
            huntingDivName: honorData.highestHuntingDivName || '暂无',
            huntingDivIcon: honorData.highestHuntingDivUrl || '',
            huntingDivSeason: honorData.highestHuntingSeason || '',
            huntingDivValue: honorData.highestHuntingValue ?? 0,
            tombPower: honorData.losttombHighestCombatPower ?? 0,
            tombProfName: honorData.losttombHighestProfessionName || '暂无',
            tombProfIcon: honorData.losttombHighestProfessionIcon || '',
            // 地铁印记总数（小目标/中目标/大目标/地铁大亨/财富自由）
            diteTotal: (honorData.xmbTimes || 0) + (honorData.zmbTimes || 0) + (honorData.dmbTimes || 0) + (honorData.dtdhTimes || 0) + (honorData.cfzyTimes || 0),
            // 古墓印记总数（金山银海/聚宝盆/富可敌国/财神显灵）
            gumuTotal: (honorData.jsyhTimes || 0) + (honorData.jbpTimes || 0) + (honorData.fkdgTimes || 0) + (honorData.csxlTimes || 0),

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

            // 团竞-传统
            teamLevelIcon: vsteamTrad.levelIcon || '',
            teamLevelName: vsteamTrad.levelName || '',
            teamFeatProgressText: `${vsteamTrad.currentExp ?? 0}/${vsteamTrad.levelUpExp ?? 0}`,
            teamFeatProgressPercent: vsteamTrad.levelProc ?? 0,
            teamMatches: get(vsteamTrad, ['pro', 0, 'v', 'v']),
            teamWins: get(vsteamTrad, ['pro', 1, 'v', 'v']),
            teamWinRate: get(vsteamTrad, ['pro', 2, 'v', 'v']),
            teamKills: get(vsteamTrad, ['pro', 3, 'v', 'v']),
            teamDamage: get(vsteamTrad, ['pro', 4, 'v', 'v']),

            // 团竞-排位
            rankedMatches: get(vsteamRanked, ['pro', 0, 'v', 'v']),
            rankedWins: get(vsteamRanked, ['pro', 1, 'v', 'v']),
            rankedWinRate: get(vsteamRanked, ['pro', 2, 'v', 'v']),
            rankedKills: get(vsteamRanked, ['pro', 3, 'v', 'v']),
            rankedKd: get(vsteamRanked, ['pro', 4, 'v', 'v']),

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

        e.reply([image, Button.homepage()])
    }
}