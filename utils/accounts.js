import { ApiService } from './api.js'
import { saveCamp, bindRole, getCamp, listCamps } from './storage.js'

/**
 * 用某个营地凭证解析它自己的游戏角色ID（营地账号 → 角色）。
 * 失败不抛异常：解析不出来只是不自动绑定，凭证照样保存。
 */
export async function resolveSelfRoleId(camp) {
	if (!camp?.openId || !camp?.token) return ''
	try {
		const api = new ApiService()
		api.useCamp(camp)
		const rid = await api.get_self_role_id()
		return rid ? String(rid) : ''
	} catch {
		return ''
	}
}

/**
 * 保存营地凭证 + 自动绑定该账号对应的角色ID（多账号核心入口）。
 * 扫码登录、凭证提交都走这里，避免每个入口各写一遍。
 *
 * @param {string} userId 机器人用户ID
 * @param {object} camp   { openId, gameOpenId, userId, token, seasonId, nickname?, userName?, platform? }
 * @returns {Promise<{camp: object|null, roleId: string, bound: boolean, isNew: boolean, total: number}>}
 */
export async function saveCampAndBind(userId, camp) {
	const payload = { ...camp }
	// 微信扫码返回的凭证里有 openId/userId，但没有平台标记，这里补一个便于展示
	if (!payload.platform) {
		payload.platform = camp.loginPlatform || camp.platform || (camp.uin ? 'qq' : 'wechat')
	}
	const { isNew } = saveCamp(userId, payload)
	const saved = getCamp(userId) || payload
	const roleId = saved.roleId || (await resolveSelfRoleId(saved))
	if (roleId) bindRole(userId, roleId)
	return {
		camp: getCamp(userId),
		roleId: roleId || '',
		bound: !!roleId,
		isNew,
		total: listCamps(userId).length,
	}
}
