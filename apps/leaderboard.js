import { ApiService } from '../utils/api.js'
import { listAllCamps } from '../utils/storage.js'

// 排行榜支持的模式：段位名/分数的取数字段都来自 rolecard3 的 roleCard
const MODES = {
	rank: { key: 'rank', name: '排位', metric: '分段', aliases: ['排位', '计分', 'rank'] },
	tdm: { key: 'tdm', name: '团竞', metric: '经验', aliases: ['团竞', '团队竞技', 'tdm'] },
	metro: { key: 'metro', name: '地铁', metric: '战力', aliases: ['地铁', '地铁逃生', 'metro'] },
	tomb: { key: 'tomb', name: '古墓', metric: '战力', aliases: ['古墓', '古墓迷途', 'tomb'] },
}

// 段位名 → 权重（越靠前越强），分数缺失时兜底排序用
const TIER_ORDER = [
	'无敌战神', '绝世战神', '战神',
	'绝世王牌', '传奇王牌', '卓越王牌', '王牌',
	'金钻', '皇冠', '星钻', '铂金', '翡翠', '黄金', '白银', '青铜',
]
function tierRank(name) {
	if (!name) return 0
	const i = TIER_ORDER.findIndex((t) => String(name).includes(t))
	return i >= 0 ? (TIER_ORDER.length - i) * 100000 : 0
}

const num = (v) => {
	const n = Number(v)
	return isFinite(n) ? n : 0
}

/** 从 roleCard 取某个模式的段位名 + 代表分 */
function segRank(roleCard, mode) {
	const rc = roleCard || {}
	const pick = (arr, i) => (Array.isArray(arr) ? (arr[i] || arr[0] || {}) : (arr || {}))
	if (mode === 'rank') {
		const r = pick(rc.mainRecord, 0)
		return { name: r.title || '', score: num(r.currentScore), tier: tierRank(r.title) }
	}
	if (mode === 'tdm') {
		const r = pick(rc.vsteamRecord, 1) // 团竞排位（[0] 为传统）
		return { name: r.levelName || '', score: num(r.currentExp), tier: tierRank(r.levelName) }
	}
	if (mode === 'metro') {
		const r = pick(rc.escapeRecord, 0)
		return { name: r.divName || '', score: num(r.currentFeat), tier: tierRank(r.divName) }
	}
	if (mode === 'tomb') {
		const r = pick(rc.losttombRecord, 0)
		return { name: r.divName || '', score: num(r.currentFeat), tier: tierRank(r.divName) }
	}
	return null
}

function withTimeout(p, ms) {
	return Promise.race([
		p,
		new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
	])
}

// 进程内缓存（12h）：避免每次都打一遍 rolecard3。重启后会重新拉一次。
const segCache = new Map()
function cacheKey(userId, mode) {
	return `${userId}:${mode}`
}

async function getSegment(camp, mode) {
	const key = cacheKey(camp.userId, mode)
	const hit = segCache.get(key)
	if (hit && Date.now() - hit.ts < 12 * 3600 * 1000) return hit.seg
	let seg = null
	if (camp?.openId && camp?.token && camp?.userId) {
		try {
			const api = new ApiService()
			api.useCamp(camp)
			const data = await withTimeout(api.get_rolecard3(String(camp.userId)), 12000)
			if (Number(data?.returnCode) === 0 && data?.data?.roleCard) {
				seg = segRank(data.data.roleCard, mode)
			}
		} catch {
			seg = null
		}
	}
	segCache.set(key, { seg, ts: Date.now() })
	return seg
}

// 并发上限：一次拉所有账号的 rolecard3，避免瞬间打爆接口
async function mapLimit(items, limit, fn) {
	const out = new Array(items.length)
	let i = 0
	async function worker() {
		while (i < items.length) {
			const idx = i++
			out[idx] = await fn(items[idx], idx)
		}
	}
	const n = Math.max(1, Math.min(limit, items.length))
	await Promise.all(Array.from({ length: n }, worker))
	return out
}

function maskQq(qq) {
	const s = String(qq || '')
	if (s.length <= 4) return s
	return s.slice(0, 2) + '***' + s.slice(-2)
}

export class Leaderboard extends plugin {
	constructor() {
		super({
			name: '[PHP]段位排行榜',
			dsc: '跨用户段位排行榜（排位/团竞/地铁/古墓，自动校验登录态）',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: '^#?和平(段位榜|段位排名|排行榜|排名榜)\\s*(排位|计分|团竞|团队竞技|地铁|地铁逃生|古墓|古墓迷途)?$', fnc: 'showBoard' },
			],
		})
	}

	async showBoard(e) {
		const m = e.msg.match(/^#?和平(段位榜|段位排名|排行榜|排名榜)\s*(排位|计分|团竞|团队竞技|地铁|地铁逃生|古墓|古墓迷途)?$/)
		const alias = (m && m[2]) || '排位'
		const mode = Object.values(MODES).find((md) => md.aliases.includes(alias)) || MODES.rank
		const md = MODES[mode.key]

		const all = listAllCamps()
		if (!all.length) {
			return e.reply('还没有任何绑定营地账号，先 #和平微信登录 / #和平QQ登录 / #提交和平 绑定后再来排行。')
		}

		await e.reply(`⏳ 正在汇总各账号「${md.name}」段位（共 ${all.length} 个账号）...`)

		const results = await mapLimit(all, 5, async ({ qq, camp }) => {
			const seg = await getSegment(camp, mode.key)
			return { qq, camp, seg }
		})

		const entries = []
		let skipped = 0
		for (const { qq, camp, seg } of results) {
			if (!seg || (!seg.score && !seg.name)) {
				skipped++
				continue
			}
			entries.push({
				qq,
				name: camp.nickname || camp.userName || camp.userId || '未知',
				divName: seg.name || '未定级',
				score: seg.score || 0,
				tier: seg.tier || 0,
			})
		}

		if (!entries.length) {
			return e.reply(`❌ 本次没有可排行的「${md.name}」段位数据（${skipped} 个账号无数据/凭证失效）。`)
		}

		entries.sort((a, b) => b.score - a.score || b.tier - a.tier || String(a.name).localeCompare(String(b.name)))

		const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ` ${i + 1}.`)
		const lines = entries.map((en, i) => {
			const scoreTxt = en.score ? ` · ${en.score}${md.metric}` : ''
			return `${medal(i)} ${en.name} · ${en.divName}${scoreTxt}（QQ ${maskQq(en.qq)}）`
		})

		const head = [
			`🏆 和平段位榜 · ${md.name}`,
			`参与 ${entries.length} 人（共 ${all.length} 个账号，其中 ${skipped} 个无数据/凭证失效）`,
			'──────────────',
		]
		const foot = [
			'',
			'提示：数据取自各账号营地角色卡，12 小时内自动复用；切换模式：#和平排行榜 排位/团竞/地铁/古墓',
		]

		return e.reply([head.join('\n'), lines.join('\n'), foot.join('\n')].join('\n'))
	}
}
