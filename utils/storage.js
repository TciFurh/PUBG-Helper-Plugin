import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.join(process.cwd(), 'data', 'PUBG-Helper-Plugin')
const dataFile = path.join(dataDir, 'UserData.json')

function ensureStore() {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
	if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({}), 'utf8')
}

function readStore() {
	ensureStore()
	try {
		return JSON.parse(fs.readFileSync(dataFile, 'utf8') || '{}')
	} catch {
		return {}
	}
}

function writeStore(store) {
	ensureStore()
	fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8')
}

/** 老数据迁移：只有单个 camp 没有 camps 数组时补成数组 */
function normalizeInfo(info) {
	if (!info.ids) info.ids = []
	if (typeof info.current !== 'number') info.current = 0
	if (!Array.isArray(info.camps)) {
		info.camps = info.camp ? [{ ...info.camp, addedAt: info.camp.updatedAt || Date.now() }] : []
		info.currentCamp = 0
	}
	if (typeof info.currentCamp !== 'number') info.currentCamp = 0
	if (info.camps.length && !info.camp) info.camp = info.camps[info.currentCamp] || info.camps[0]
	if (!info.camps.length && info.camp) info.camp = null
	// 迁移：ids 里存成角色ID的旧数据替换为营地ID（rolecard3/getresultbytypev2 等查询接口都要营地ID）
	for (const c of info.camps || []) {
		if (!c?.userId || !c.roleId) continue
		const rid = String(c.roleId)
		const uid = String(c.userId)
		if (rid === uid) continue
		const ri = info.ids.indexOf(rid)
		if (ri < 0) continue
		const ui = info.ids.indexOf(uid)
		if (ui >= 0) {
			// 两个都在：去掉角色ID那份，current 修正到营地ID的位置
			info.ids.splice(ri, 1)
			if (info.current === ri) info.current = ui > ri ? ui - 1 : ui
			else if (info.current > ri) info.current--
		} else {
			info.ids[ri] = uid
		}
	}
	if (info.current >= info.ids.length) info.current = Math.max(0, info.ids.length - 1)
	return info
}

export function getUserInfo(userId) {
	const store = readStore()
	const before = store[userId] ? JSON.stringify(store[userId]) : ''
	if (!store[userId]) store[userId] = { ids: [], current: 0, prefMainIndex: 0 }
	store[userId] = normalizeInfo(store[userId])
	if (JSON.stringify(store[userId]) !== before) writeStore(store)
	return { store, info: store[userId] }
}

export function saveUserInfo(userId, updater) {
	const store = readStore()
	const current = normalizeInfo(store[userId] || { ids: [], current: 0 })
	store[userId] = normalizeInfo(updater(current) || current)
	writeStore(store)
	return store[userId]
}

export function formatIdList(info) {
	return info.ids.map((id, index) => {
		const owner = (info.camps || []).find((c) => String(c.userId) === String(id) || String(c.roleId) === String(id))
		const tag = owner ? `（${owner.nickname || owner.userName || owner.userId}）` : ''
		return `${index === info.current ? '✅' : '☑️'} ${index + 1}. ${id}${tag}`
	}).join('\n')
}

// ---- 营地登录凭证 ----
// 单个账号结构： camp = { openId, gameOpenId, userId, token, seasonId, userName, nickname, platform, roleId, roleName, updatedAt }
// 一个 QQ 用户可以绑多个营地账号，camps 是数组，camp 永远指向「当前账号」（老代码只用 camp，保持兼容）

/** 按 openId/userId 判断两个凭证是不是同一个账号 */
function sameAccount(a, b) {
	if (!a || !b) return false
	if (a.openId && b.openId && a.openId === b.openId) return true
	return String(a.userId) === String(b.userId) && String(a.userId) !== 'undefined'
}

export function getCamp(qqUserId) {
	const { info } = getUserInfo(qqUserId)
	return info.camp || null
}

/** 列出全部营地账号 */
export function listCamps(qqUserId) {
	const { info } = getUserInfo(qqUserId)
	return info.camps || []
}

/**
 * 保存/更新一个营地账号（同 openId 视为同一账号，覆盖 token），并把它设为当前账号。
 * 返回 { camp, index, isNew }
 */
export function saveCamp(qqUserId, camp) {
	let isNew = false
	let index = 0
	const info = saveUserInfo(qqUserId, (cur) => {
		const camps = cur.camps || []
		const payload = { ...camp, updatedAt: Date.now() }
		const i = camps.findIndex((c) => sameAccount(c, payload))
		if (i >= 0) {
			// 保留之前解析出来的角色信息
			camps[i] = { ...camps[i], ...payload, addedAt: camps[i].addedAt || payload.updatedAt }
			index = i
		} else {
			payload.addedAt = payload.updatedAt
			camps.push(payload)
			index = camps.length - 1
			isNew = true
		}
		cur.camps = camps
		cur.currentCamp = index
		cur.camp = camps[index]
		return cur
	})
	return { camp: info.camp, index, isNew }
}

/** 切换当前营地账号（0 基） */
export function switchCamp(qqUserId, index) {
	const info = saveUserInfo(qqUserId, (cur) => {
		const camps = cur.camps || []
		if (index < 0 || index >= camps.length) throw new Error('序号无效')
		cur.currentCamp = index
		cur.camp = camps[index]
		// 该账号有对应绑定ID就一起切过去（ids 是营地ID，兼容未迁移的 roleId）
		const want = String(camps[index].userId || '')
		let ri = want ? cur.ids.indexOf(want) : -1
		if (ri < 0 && camps[index].roleId) ri = cur.ids.indexOf(String(camps[index].roleId))
		if (ri >= 0) cur.current = ri
		return cur
	})
	return info.camp
}

/** 删除某个营地账号（0 基）；同时把它名下的角色从 ids 里摘掉（如果没被别的账号引用） */
export function removeCampAt(qqUserId, index) {
	const info = saveUserInfo(qqUserId, (cur) => {
		const camps = cur.camps || []
		if (index < 0 || index >= camps.length) throw new Error('序号无效')
		const [removed] = camps.splice(index, 1)
		// 从绑定列表里摘掉这个账号（ids 是营地ID，兼容未迁移的 roleId）
		const removedId = String(removed?.userId || '')
		let ri = removedId ? cur.ids.indexOf(removedId) : -1
		if (ri < 0 && removed?.roleId) ri = cur.ids.indexOf(String(removed.roleId))
		if (ri >= 0) cur.ids.splice(ri, 1)
		cur.camps = camps
		if (!camps.length) {
			cur.currentCamp = 0
			cur.camp = null
			cur.current = 0
		} else {
			cur.currentCamp = Math.min(cur.currentCamp, camps.length - 1)
			cur.camp = camps[cur.currentCamp]
			// 当前绑定ID跟着当前账号走，避免「账号是A、ID是B」的错配
			const want = String(cur.camp.userId || '')
			let ri = want ? cur.ids.indexOf(want) : -1
			if (ri < 0 && cur.camp.roleId) ri = cur.ids.indexOf(String(cur.camp.roleId))
			if (ri >= 0) cur.current = ri
		}
		if (cur.current >= cur.ids.length) cur.current = Math.max(0, cur.ids.length - 1)
		return cur
	})
	return info
}

export function deleteCamp(qqUserId) {
	// 兼容老接口：删掉当前账号
	const info = getUserInfo(qqUserId).info
	const idx = info.camps?.length ? info.currentCamp : -1
	if (idx >= 0) return removeCampAt(qqUserId, idx)
	saveUserInfo(qqUserId, (cur) => { cur.camp = null; return cur })
	return getUserInfo(qqUserId).info
}

/**
 * 把一个角色ID绑到当前账号名下，并设为当前角色
 * @param {boolean} force true=自动绑定（覆盖账号已有角色）；false=手动绑定（只在账号还没角色时写入）
 */
/** 把一个营地ID绑到账号名下并设为当前；roleId 只存档到对应营地账号（展示/切换映射用），不进 ids */
export function bindCampId(qqUserId, campUserId, roleId = '') {
	const id = String(campUserId)
	return saveUserInfo(qqUserId, (cur) => {
		if (!cur.ids.includes(id)) cur.ids.push(id)
		cur.current = cur.ids.indexOf(id)
		const camps = cur.camps || []
		const ci = camps.findIndex((c) => String(c.userId) === id)
		if (ci >= 0) {
			if (roleId && String(roleId) !== id) camps[ci].roleId = String(roleId)
			cur.currentCamp = ci
			cur.camp = camps[ci]
		}
		return cur
	})
}

/** 记录某营地账号解析出来的角色ID（只存档，不进 ids） */
export function setCampRoleId(qqUserId, campUserId, roleId) {
	const id = String(campUserId)
	return saveUserInfo(qqUserId, (cur) => {
		const c = (cur.camps || []).find((x) => String(x.userId) === id)
		if (c && roleId && String(roleId) !== id) c.roleId = String(roleId)
		return cur
	})
}

/** 切换角色：若该角色归属另一个营地账号，把营地账号一起切过去（否则 token 与角色对不上） */
export function switchRole(qqUserId, index) {
	return saveUserInfo(qqUserId, (cur) => {
		if (index < 0 || index >= cur.ids.length) throw new Error('序号无效')
		cur.current = index
		const rid = String(cur.ids[index])
		const camps = cur.camps || []
		const ci = camps.findIndex((c) => String(c.userId) === rid || String(c.roleId) === rid)
		if (ci >= 0) {
			cur.currentCamp = ci
			cur.camp = camps[ci]
		}
		return cur
	})
}

/** 删除角色 */
export function removeRole(qqUserId, index) {
	return saveUserInfo(qqUserId, (cur) => {
		if (index < 0 || index >= cur.ids.length) throw new Error('序号无效')
		const [removed] = cur.ids.splice(index, 1)
		for (const c of cur.camps || []) if (String(c.roleId) === String(removed)) delete c.roleId
		if (cur.current >= cur.ids.length) cur.current = Math.max(0, cur.ids.length - 1)
		return cur
	})
}

/** 营地账号列表文案 */
export function formatCampList(info) {
	const camps = info.camps || []
	if (!camps.length) return '还没有绑定营地账号'
	const platform = { wechat: '微信', qq: 'QQ', cookie: '凭证' }
	return camps.map((c, i) => {
		const name = c.nickname || c.userName || c.uin || c.userId
		const pf = platform[c.platform] || (c.platform ? c.platform : '未知')
		const role = c.roleId ? `角色 ${c.roleId}` : '未解析角色'
		return `${i === info.currentCamp ? '✅' : '☑️'} ${i + 1}. ${name}（${pf} · ${role}）`
	}).join('\n')
}

export function maskToken(token) {
	if (!token) return ''
	if (token.length <= 8) return token.slice(0, 2) + '****'
	return token.slice(0, 6) + '****' + token.slice(-4)
}

/**
 * 取当前账号的营地凭证；未绑定时自动回复引导并返回 null。
 * 用法：const camp = requireCamp(e); if (!camp) return
 */
export function requireCamp(e) {
	const camp = getCamp(e.user_id)
	if (camp && camp.token) return camp
	e.reply([
		'❌ 还没有绑定和平营地凭证',
		'· 扫码登录：#和平QQ登录 或 #和平微信登录',
		'· 已有凭证：#提交和平 openId:gameOpenId:userId:token',
	]).catch(() => { })
	return null
}
