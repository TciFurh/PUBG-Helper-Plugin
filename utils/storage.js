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


