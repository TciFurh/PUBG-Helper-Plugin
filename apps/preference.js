import { getUserInfo, saveUserInfo } from '../utils/storage.js'

const MODES = ['第三人称-四排-全部', '第三人称-双排-全部', '第三人称-单排-全部', 
	'第一人称-四排-全部', '第一人称-双排-全部', '第一人称-单排-全部',
	'第三人称-四排-经典', '第三人称-双排-经典', '第三人称-单排-经典',
	'第一人称-四排-经典', '第一人称-双排-经典', '第一人称-单排-经典', '创意工坊']

const helpTips = '索引与模式：\n' + MODES.map((mode, i) => `${i} ${mode}`).join('\n') + '\n(全部的意思就是包含创意工坊)'

export class Preference extends plugin {
	constructor() {
		super({
			name: '[PHP]偏好设置',
			dsc: '设置默认对局展示索引',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: /^#?设置对局(索引)?\s*(-?\d{1,2})$/i, fnc: 'setMainIndex' },
				{ reg: /^#?查看对局(索引)?$/i, fnc: 'getMainIndex' },
				{ reg: /^#?对局索引(帮助|说明)?$/i, fnc: 'help' }
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
		if (idx < 0 || idx >= MODES.length) return e.reply(`只支持索引：0-${MODES.length - 1}`)
		
		saveUserInfo(userId, cur => { cur.prefMainIndex = idx; return cur })
		return e.reply(`已设置默认对局索引为：${idx}`)
	}
}