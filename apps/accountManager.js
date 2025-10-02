import { getUserInfo, saveUserInfo, formatIdList } from '../utils/storage.js'

export class AccountManager extends plugin {
	constructor() {
		super({
			name: '[PHP]账号管理',
			dsc: '和平精英账号绑定/切换/删除',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: '^#我的和平ID$', fnc: 'myIds' },
				{ reg: '^#绑定和平\\s*(.*)$', fnc: 'bindId' },
				{ reg: '^#切换和平\\s*(.*)$', fnc: 'switchId' },
				{ reg: '^#删除和平\\s*(.*)$', fnc: 'deleteId' }
			]
		})
	}

	async myIds(e) {
		const userId = (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
		const { info } = getUserInfo(userId)
		if (!info.ids.length) {
			return e.reply('你还没有绑定任何ID，可用指令：\n#绑定和平+ID')
		}
		return e.reply([ segment.at(userId), '\n', formatIdList(info) ])
	}

	async bindId(e) {
		const userId = (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
		const id = String(e.msg.replace(/^#绑定和平\s*/, '')).trim()
		if (!/^\d+$/.test(id)) return e.reply('请输入正确的用户ID（纯数字）')
		saveUserInfo(userId, (cur) => {
			if (!cur.ids.includes(id)) {
				cur.ids.push(id)
				if (cur.ids.length === 1) cur.current = 0
			}
			return cur
		})
		const { info } = getUserInfo(userId)
		return e.reply(['绑定成功，当前账号：', id, '\n', formatIdList(info)])
	}

	async switchId(e) {
		const userId = (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
		const index = parseInt(e.msg.replace(/^#切换和平\s*/, '')) - 1
		const { info } = getUserInfo(userId)
		if (!info.ids.length) return e.reply('你还没有绑定任何ID')
		if (Number.isNaN(index) || index < 0 || index >= info.ids.length) return e.reply('序号无效')
		saveUserInfo(userId, (cur) => { cur.current = index; return cur })
		return e.reply(['已切换至：', info.ids[index], '\n', formatIdList(getUserInfo(userId).info)])
	}

	async deleteId(e) {
		const userId = (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
		const index = parseInt(e.msg.replace(/^#删除和平\s*/, '')) - 1
		const { info } = getUserInfo(userId)
		if (!info.ids.length) return e.reply('你还没有绑定任何ID')
		if (Number.isNaN(index) || index < 0 || index >= info.ids.length) return e.reply('序号无效')
		const deleted = info.ids[index]
		saveUserInfo(userId, (cur) => {
			cur.ids.splice(index, 1)
			if (cur.current >= cur.ids.length) cur.current = Math.max(0, cur.ids.length - 1)
			return cur
		})
		return e.reply(['已删除：', deleted, '\n', formatIdList(getUserInfo(userId).info)])
	}
}


