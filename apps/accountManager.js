import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import Button from '../utils/button.js'

import {
	getUserInfo, formatIdList,
	listCamps, formatCampList, switchCamp, removeCampAt, bindCampId, setCampRoleId, switchRole, removeRole,
	maskToken,
} from '../utils/storage.js'
import { resolveSelfRoleId } from '../utils/accounts.js'

export class AccountManager extends plugin {
	constructor() {
		super({
			name: '[PHP]账号管理',
			dsc: '和平精英账号绑定/切换/删除（支持多营地账号）',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: '^#我的和平ID$', fnc: 'myIds' },
				{ reg: '^#绑定和平\\s*(.*)$', fnc: 'bindId' },
				{ reg: '^#切换和平\\s*(\\d+)$', fnc: 'switchId' },
				{ reg: '^#删除和平\\s*(\\d+)$', fnc: 'deleteId' },
				{ reg: '^#和平账号$', fnc: 'myCamps' },
				{ reg: '^#切换和平账号\\s*(\\d+)$', fnc: 'switchAccount' },
				{ reg: '^#删除和平账号\\s*(\\d+)$', fnc: 'deleteAccount' },
			]
		})
	}

	#target(e) {
		return (e.at && e.isMaster && !e.atme) ? e.at : e.user_id
	}

	async myIds(e) {
		const userId = this.#target(e)
		const { info } = getUserInfo(userId)
		if (!info.ids.length) {
			return e.reply('你还没有绑定任何ID。\n扫码登录（#和平微信登录 / #和平QQ登录）会自动绑定角色ID，也可以 #绑定和平 <ID>')
		}
		const camp = info.camp
		const head = camp
			? `当前营地账号：${camp.nickname || camp.userName || camp.userId}（角色 ${camp.roleId || info.ids[info.current] || '未解析'}）\n共 ${info.ids.length} 个角色：`
			: `共 ${info.ids.length} 个角色：`
		return e.reply([segment.at(userId), '\n', head, '\n', formatIdList(info), Button.account()])
	}

	async bindId(e) {
		const userId = this.#target(e)
		const id = String(e.msg.replace(/^#绑定和平\s*/, '')).trim()
		if (!/^\d+$/.test(id)) return e.reply('请输入正确的用户ID（纯数字）')
		bindCampId(userId, id)
		const { info } = getUserInfo(userId)
		return e.reply(['绑定成功，当前角色：', id, '\n', formatIdList(info)])
	}

	async switchId(e, match) {
		const userId = this.#target(e)
		const index = Number(match[1]) - 1
		const { info } = getUserInfo(userId)
		if (!info.ids.length) return e.reply('你还没有绑定任何ID')
		try {
			switchRole(userId, index)
		} catch {
			return e.reply('序号无效')
		}
		const after = getUserInfo(userId).info
		const rid = String(after.ids[after.current])
		const owned = (after.camps || []).some((c) => String(c.roleId) === rid)
		return e.reply([
			'已切换至：', rid,
			after.camp ? `\n营地账号：${after.camp.nickname || after.camp.userName || after.camp.userId}` : '',
			owned ? '' : '\n⚠️ 该角色没关联到任何营地账号，凭证可能对不上，建议用 #和平微信登录 重新扫码（会自动绑定）',
			'\n', formatIdList(after),
		])
	}

	async deleteId(e, match) {
		const userId = this.#target(e)
		const index = Number(match[1]) - 1
		const { info } = getUserInfo(userId)
		if (!info.ids.length) return e.reply('你还没有绑定任何ID')
		const deleted = info.ids[index]
		try {
			removeRole(userId, index)
		} catch {
			return e.reply('序号无效')
		}
		return e.reply(['已删除角色：', String(deleted), '\n', formatIdList(getUserInfo(userId).info)])
	}

	// ===== 营地账号（多账号） =====
	async myCamps(e) {
		const userId = this.#target(e)
		const { info } = getUserInfo(userId)
		const camps = listCamps(userId)
		if (!camps.length) {
			return e.reply('还没有绑定营地账号。\n可用 #和平微信登录 / #和平QQ登录 扫码，或 #提交和平 粘贴凭证，登录后角色ID会自动绑定。')
		}
		const platformMap = { wechat: '微信', qq: 'QQ', cookie: '凭证' }
		const data = {
			total: camps.length,
			camps: camps.map((c, i) => ({
				no: i + 1,
				name: c.nickname || c.userName || c.userId || '未知账号',
				platform: platformMap[c.platform] || platformMap[c.loginPlatform] || '未知',
				roleId: c.roleId || '未解析',
				tokenTail: maskToken(c.token),
				updatedAt: new Date(c.updatedAt || Date.now()).toLocaleDateString('zh-CN'),
				isCurrent: i === info.currentCamp,
			})),
		}
		try {
			const image = await puppeteer.screenshot('camps', {
				tplFile: 'plugins/PUBG-Helper-Plugin/resources/camps.html',
				...data,
			})
			if (image) return e.reply([image, Button.account()])
		} catch { /* 渲染失败回文本 */ }
		const cur = camps[info.currentCamp] || camps[0]
		return e.reply([
			segment.at(userId), '\n',
			`共 ${camps.length} 个营地账号：`,
			formatCampList(info),
			'',
			`当前：${cur.nickname || cur.userName || cur.userId}`,
			`token：${maskToken(cur.token)} · 更新于 ${new Date(cur.updatedAt || Date.now()).toLocaleString('zh-CN')}`,
			'',
			'#切换和平账号 <序号> · #删除和平账号 <序号> · #删除和平凭证（删当前）'
		])
	}

	async switchAccount(e, match) {
		const userId = this.#target(e)
		const index = Number(match[1]) - 1
		const camps = listCamps(userId)
		if (!camps.length) return e.reply('还没有绑定营地账号，先 #和平微信登录 或 #和平QQ登录')
		try {
			switchCamp(userId, index)
		} catch {
			return e.reply('序号无效')
		}
		// 老数据可能没存角色ID：切过去时顺手解析一次，保证「token ↔ 角色」成对
		let info = getUserInfo(userId).info
		if (info.camp && !info.camp.roleId) {
			const rid = await resolveSelfRoleId(info.camp)
			if (rid) {
				// 角色ID只存档到账号上，不进绑定列表（列表统一是营地ID）
				setCampRoleId(userId, info.camp.userId, rid)
				info = getUserInfo(userId).info
			}
		}
		const c = info.camp
		return e.reply([
			`✅ 已切换到：${c.nickname || c.userName || c.userId}`,
			c.roleId ? `角色：${c.roleId}` : '该账号还没解析出角色，可 #绑定和平 <ID>',
			'',
			formatCampList(info),
		])
	}

	async deleteAccount(e, match) {
		const userId = this.#target(e)
		const index = Number(match[1]) - 1
		const camps = listCamps(userId)
		if (!camps.length) return e.reply('还没有绑定营地账号')
		const name = camps[index] ? (camps[index].nickname || camps[index].userName || camps[index].userId) : ''
		try {
			removeCampAt(userId, index)
		} catch {
			return e.reply('序号无效')
		}
		const info = getUserInfo(userId).info
		return e.reply([
			`已删除营地账号：${name}`,
			info.camps.length ? `\n剩余 ${info.camps.length} 个：\n${formatCampList(info)}` : '已无绑定账号',
		])
	}
}
