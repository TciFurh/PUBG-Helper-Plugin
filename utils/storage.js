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

export function getUserInfo(userId) {
	const store = readStore()
	if (!store[userId]) {
		store[userId] = { ids: [], current: 0, prefMainIndex: 0 }
		writeStore(store)
	}
	return { store, info: store[userId] }
}

export function saveUserInfo(userId, updater) {
	const store = readStore()
	const current = store[userId] || { ids: [], current: 0 }
	store[userId] = updater(current)
	writeStore(store)
}

export function formatIdList(info) {
	return info.ids.map((id, index) => `${index === info.current ? '✅' : '☑️'} ${index + 1}. ${id}`).join('\n')
}

// ---- 营地登录凭证(抓包提交) ----
// camp = { openId, gameOpenId, userId, token, seasonId, updatedAt }

export function getCamp(qqUserId) {
	const { info } = getUserInfo(qqUserId)
	return info.camp || null
}

export function saveCamp(qqUserId, camp) {
	saveUserInfo(qqUserId, (cur) => {
		cur.camp = { ...camp, updatedAt: Date.now() }
		return cur
	})
}

export function deleteCamp(qqUserId) {
	saveUserInfo(qqUserId, (cur) => {
		delete cur.camp
		return cur
	})
}

export function maskToken(token) {
	if (!token) return ''
	if (token.length <= 8) return token.slice(0, 2) + '****'
	return token.slice(0, 6) + '****' + token.slice(-4)
}


