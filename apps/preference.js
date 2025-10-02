import { getUserInfo, saveUserInfo } from '../utils/storage.js'

const helpTips = [
	'索引与模式：',
	'0 第三人称-四排',
	'1 第三人称-双排',
	'2 第三人称-单排',
	'3 第一人称-四排',
	'4 第一人称-双排',
	'5 第一人称-单排',
	'12 创意工坊'
].join('\n')

export class Preference extends plugin {
	constructor() {
		super({
			name: '[PHP]偏好设置',
			dsc: '设置默认对局展示索引',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: /^#设置对局(索引)?\s*(-?\d{1,2})$/i, fnc: 'setMainIndex' },
				{ reg: /^#查看对局(索引)?$/i, fnc: 'getMainIndex' },
				{ reg: /^#对局索引(帮助|说明)?$/i, fnc: 'help' }
			]
		})
	}

	async help(e) {
		return e.reply(helpTips)
	}

	async getMainIndex(e) {
		const userId = e.user_id
		const { info } = getUserInfo(userId)
		return e.reply(`当前默认对局索引：${info.prefMainIndex ?? 0}\n` + helpTips)
	}

	async setMainIndex(e) {
		const userId = e.user_id
		const match = e.msg.match(/#设置对局(?:索引)?\s*(-?\d{1,2})/i)
		if (!match) return e.reply('用法：#设置对局索引 0\n' + helpTips)
		const idx = Number(match[1])
		const allow = new Set([0,1,2,3,4,5,12])
		if (!allow.has(idx)) return e.reply('只支持索引：0,1,2,3,4,5,12')
		saveUserInfo(userId, (cur) => { cur.prefMainIndex = idx; return cur })
		return e.reply(`已设置默认对局索引为：${idx}`)
	}
}


