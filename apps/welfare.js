import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { requireCamp } from '../utils/storage.js'
import { localizeWithNotice } from '../utils/localImg.js'
import Button from '../utils/button.js'

const apiService = new ApiService()

/** 地铁/营地角标（对照真机福利商城 UI 与抓包字段）：
 *  rewardItemId 以 camp_ 开头 → 营地道具；awardType=4 → 地铁道具；其余无角标 */
function markOf(it) {
    if (/^camp_/i.test(String(it.rewardItemId || ''))) return { mark: '营地', markCls: 'camp' }
    if (Number(it.awardType) === 4) return { mark: '地铁', markCls: 'metro' }
    return {}
}

function periodText(it) {
    if (Number(it.periodType) === 2) return '本周兑换'
    if (Number(it.periodType) === 1) return '本日兑换'
    return '本期兑换'
}

function nowStr() {
    return new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 余额 → { fulibi, frag, fulibiIcon, fragIcon }（scoreList: type=3 福利币 / type=5 装饰碎片） */
function pickBalances(data) {
    const list = (data && data.scoreList) || []
    const byType = (t) => list.find((s) => String(s.type) === String(t))
    const fulibi = byType(3)
    const frag = byType(5)
    return {
        fulibi: Number(fulibi?.num ?? (data && data.totalScore) ?? 0),
        frag: Number(frag?.num ?? 0),
        fulibiIcon: fulibi?.icon || '',
        fragIcon: frag?.icon || '',
    }
}

export class WelfareCenter extends plugin {
    constructor() {
        super({
            name: '[PHP]福利中心',
            dsc: '福利商城查看/兑换 + 碎片夺宝抽奖（营地福利币 & 装饰碎片）',
            event: 'message',
            priority: 1,
            rule: [
                { reg: '^#?和平福利(商城)?$', fnc: 'showMall' },
                { reg: '^#?和平福利兑换\\s+(.+)$', fnc: 'doExchange' },
                { reg: '^#?和平夺宝(单抽|十连|10连)?$', fnc: 'showDraw' },
            ],
        })
    }

    async getRole(e) {
        const camp = requireCamp(e)
        if (!camp) return null
        apiService.useCamp(camp)
        const roleId = await apiService.get_self_role_id()
        if (!roleId) {
            e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')
            return null
        }
        return { roleId }
    }

    // ---- #和平福利：商城总览（余额 + 兑换列表） ----
    async showMall(e) {
        const got = await this.getRole(e)
        if (!got) return
        const { roleId } = got
        try {
            const [scoreRes, exRes] = await Promise.all([
                apiService.get_user_score(roleId),
                apiService.get_score_exchange(roleId),
            ])
            if (Number(exRes.returnCode) !== 0) return e.reply('❌ 福利商城获取失败：' + (exRes.returnMsg || exRes.returnCode))
            const bal = pickBalances(scoreRes.data)
            const items = (exRes.data?.info || []).map((it, i) => ({
                ...it,
                icon: it.bonusIcon || '', // 统一字段：接口叫 bonusIcon，模板统一读 icon
                idx: i + 1,
                periodText: periodText(it),
                ...markOf(it),
                afford: bal.fulibi >= Number(it.expendScore || 0) && Number(it.exchangedCount || 0) < Number(it.exchangeLimit || 0),
            }))

            const tplData = {
                ...bal,
                items,
                roleName: e.sender?.card || e.sender?.nickname || '',
                updated: nowStr(),
            }
            await localizeWithNotice(e, tplData, '福利商城')
            const image = await puppeteer.screenshot('welfare', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/welfare.html',
                ...tplData,
            })
            e.reply([image, Button.welfare()])
        } catch (err) {
            e.reply('❌ 福利商城查询失败：' + (err.message || err))
        }
    }

    // ---- #和平福利兑换 <编号/名称> ----
    async doExchange(e) {
        const got = await this.getRole(e)
        if (!got) return
        const { roleId } = got
        const arg = e.msg.replace(/^#?和平福利兑换\s*/, '').trim()
        try {
            const exRes = await apiService.get_score_exchange(roleId)
            if (Number(exRes.returnCode) !== 0) return e.reply('❌ 福利商城获取失败：' + (exRes.returnMsg || exRes.returnCode))
            const list = exRes.data?.info || []

            let item = null
            if (/^\d+$/.test(arg)) {
                item = list[Number(arg) - 1]
                if (!item) return e.reply(`❌ 编号超出范围（1-${list.length}），发 #和平福利 查看列表`)
            } else {
                const hits = list.filter((it) => String(it.bonusName).includes(arg))
                if (!hits.length) return e.reply(`❌ 没找到名称含「${arg}」的商品，发 #和平福利 查看列表`)
                if (hits.length > 1) {
                    return e.reply(`「${arg}」匹配到 ${hits.length} 件商品，请换更精确的名称：\n` + hits.slice(0, 8).map((it) => `· ${it.bonusName}（${it.expendScore}福利币）`).join('\n'))
                }
                item = hits[0]
            }

            if (Number(item.exchangedCount) >= Number(item.exchangeLimit)) {
                return e.reply(`❌「${item.bonusName}」本${periodText(item).slice(2, 4)}额度已用完（${item.exchangedCount}/${item.exchangeLimit}）`)
            }

            const bal = pickBalances((await apiService.get_user_score(roleId)).data)
            if (bal.fulibi < Number(item.expendScore)) {
                return e.reply(`❌ 福利币不足：需要 ${item.expendScore}，当前 ${bal.fulibi}`)
            }

            const res = await apiService.score_exchange(item.bonusId, roleId)
            if (Number(res.returnCode) !== 0) {
                return e.reply(`❌ 兑换失败：${res.returnMsg || res.returnCode}`)
            }

            const reward = res.data?.reward || item
            const after = Number(res.data?.curScore ?? bal.fulibi - Number(item.expendScore))
            const tplData = {
                title: '兑换成功',
                subtitle: markOf(reward).mark || '',
                roleName: e.sender?.card || e.sender?.nickname || '',
                updated: nowStr(),
                balance: after,
                balanceLabel: '福利币余额',
                balanceIcon: bal.fulibiIcon,
                secName: reward.bonusName || reward.name || item.bonusName,
                secNote: `消耗 ${item.expendScore} 福利币`,
                items: [{
                    ...(reward.bonusIcon ? { icon: reward.bonusIcon } : { icon: item.bonusIcon }),
                    name: reward.name || item.bonusName,
                    count: `×${reward.num || item.bonusCount || 1}`,
                    ...markOf(reward.awardType !== undefined ? reward : item),
                }],
                foot: '奖励已发放到对应账户（游戏内道具到游戏、营地道具到营地背包）',
            }
            await localizeWithNotice(e, tplData, '福利兑换')
            const image = await puppeteer.screenshot('welfareDraw', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/welfareDraw.html',
                ...tplData,
            })
            e.reply([image, Button.welfare()])
        } catch (err) {
            e.reply('❌ 兑换失败：' + (err.message || err))
        }
    }

    // ---- #和平夺宝 [单抽/十连] ----
    async showDraw(e) {
        const got = await this.getRole(e)
        if (!got) return
        const { roleId } = got
        const action = (e.msg.match(/^#?和平夺宝(单抽|十连|10连)?$/)?.[1]) || ''
        const times = (action === '单抽') ? 1 : (action ? 10 : 0) // 无动作=只看奖池
        try {
            const bal = pickBalances((await apiService.get_user_score(roleId)).data)
            const cfgRes = await apiService.get_score_draw('fragment', roleId)
            if (Number(cfgRes.returnCode) !== 0) return e.reply('❌ 夺宝奖池获取失败：' + (cfgRes.returnMsg || cfgRes.returnCode))
            const cfg = cfgRes.data || {}
            const pool = (cfg.config || []).map((it) => ({
                icon: it.icon,
                name: it.name,
                count: `×${it.num || it.itemCount || 1}`,
                ...markOf(it),
            }))

            if (!times) {
                // 只看奖池 + 最近中奖记录
                const hisRes = await apiService.get_draw_history('fragment', 0, roleId)
                const history = (hisRes.data?.list || []).slice(0, 5)
                const foot = [
                    `<b>单抽 ${cfg.oneCost} · 十连 ${cfg.multiCost}</b>（营地装饰碎片）· 每日凌晨 4 点刷新`,
                    history.length ? '最近中奖：' + history.map((h) => h.rewardName).join('、') : '暂无中奖记录',
                    '抽奖：<b>#和平夺宝 单抽</b> / <b>#和平夺宝 十连</b>',
                ].join('<br/>')
                const tplData = {
                    title: '碎片夺宝',
                    subtitle: '奖池',
                    roleName: e.sender?.card || e.sender?.nickname || '',
                    updated: nowStr(),
                    balance: bal.frag,
                    balanceLabel: '装饰碎片',
                    balanceIcon: bal.fragIcon,
                    secName: '奖池一览',
                    secNote: `共 ${pool.length} 种奖励`,
                    costNote: `单抽 ${cfg.oneCost} · 十连 ${cfg.multiCost}`,
                    items: pool,
                    foot,
                }
                await localizeWithNotice(e, tplData, '碎片夺宝')
                const image = await puppeteer.screenshot('welfareDraw', {
                    tplFile: 'plugins/PUBG-Helper-Plugin/resources/welfareDraw.html',
                    ...tplData,
                })
                return e.reply([image, Button.welfare()])
            }

            // 抽奖
            const cost = times === 1 ? Number(cfg.oneCost || 0) : Number(cfg.multiCost || 0)
            if (bal.frag < cost) {
                return e.reply(`❌ 装饰碎片不足：需要 ${cost}，当前 ${bal.frag}\n碎片来自每日签到与营地任务`)
            }
            const drawRes = await apiService.score_draw('fragment', times, roleId)
            if (Number(drawRes.returnCode) !== 0) {
                return e.reply(`❌ 抽奖失败：${drawRes.returnMsg || drawRes.returnCode}`)
            }
            const rewards = drawRes.data?.rewardList || []
            const after = pickBalances((await apiService.get_user_score(roleId)).data)
            const tplData = {
                title: times === 1 ? '单抽结果' : '十连结果',
                subtitle: `消耗 ${cost} 碎片`,
                roleName: e.sender?.card || e.sender?.nickname || '',
                updated: nowStr(),
                balance: after.frag,
                balanceLabel: '装饰碎片余额',
                balanceIcon: bal.fragIcon,
                secName: '本次获得',
                secNote: `共 ${rewards.length} 件奖励`,
                items: rewards.map((it) => ({
                    icon: it.icon,
                    name: it.name,
                    count: `×${it.num || 1}`,
                    hit: Number(it.isKernel) === 1,
                    ...markOf(it),
                })),
                foot: '奖励已发放：游戏内道具到游戏邮箱/仓库，营地道具到营地背包',
            }
            await localizeWithNotice(e, tplData, '碎片夺宝')
            const image = await puppeteer.screenshot('welfareDraw', {
                tplFile: 'plugins/PUBG-Helper-Plugin/resources/welfareDraw.html',
                ...tplData,
            })
            e.reply([image, Button.welfare()])
        } catch (err) {
            e.reply('❌ 夺宝查询失败：' + (err.message || err))
        }
    }
}
