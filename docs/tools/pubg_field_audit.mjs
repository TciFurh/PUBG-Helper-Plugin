/**
 * 详情字段覆盖率审计：拉一局地铁/超体的原始详情，列出「接口有但模板没用到」的字段。
 * 用法同预览脚本：REUSE 无关，直接跑。
 *   "D:/Code/nodejs/node.exe" ".../scripts/pubg_field_audit.mjs"
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ROOT = process.env.JIULI_ROOT || 'D:/jiuli'
createRequire(path.join(ROOT, 'package.json'))
const load = (p) => import(pathToFileURL(path.join(PLUGIN, p)).href)
const { ApiService } = await load('utils/api.js')

const api = new ApiService()
const store = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/PUBG-Helper-Plugin/UserData.json'), 'utf8'),
)
const camp = Object.values(store).map((v) => v.camp).filter(Boolean)[0]
api.useCamp(camp)
const roleId = await api.get_self_role_id()

const picks = {}
for (const tabIndex of [-1, 1, 2, 5]) {
  for (let page = 1; page <= 4; page++) {
    const res = await api.get_pubgbattlelist(roleId, { page, pageSize: 10, tabIndex })
    const list = (res.data && res.data.list) || []
    if (!list.length) break
    for (const it of list) {
      if (it.tabIndex === 5 && !picks.metro) picks.metro = it
      if (it.modeDesc === '创意' && !picks.super) picks.super = it
      if (it.tabIndex === 2 && !picks.tdm) picks.tdm = it
    }
  }
}

const OUT = path.join(ROOT, 'temp_preview')
fs.mkdirSync(OUT, { recursive: true })

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        out.push(`${key}[${v.length}]`)
        if (v[0] && typeof v[0] === 'object') flatten(v[0], `${key}[0]`, out)
      } else {
        flatten(v, key, out)
      }
    } else {
      out.push(`${key} = ${JSON.stringify(v)}`)
    }
  }
  return out
}

for (const k of ['metro', 'super', 'tdm']) {
  const it = picks[k]
  if (!it) continue
  const res = await api.get_pubgplaydetail(it.battleId, it.battleMode, roleId)
  fs.writeFileSync(path.join(OUT, `raw_${k}.json`), JSON.stringify(res.data, null, 2), 'utf8')
  console.log(`\n===== ${k} (${it.mapDesc}) =====`)
  console.log('顶层字段:', Object.keys(res.data).join(', '))
  for (const b of res.data.dataList || []) {
    console.log(`  block ${b.type}: keys=${Object.keys(b.data || {}).join(',')}`)
  }
  if (k === 'metro' || k === 'super') {
    const dump = flatten(res.data)
    fs.writeFileSync(path.join(OUT, `fields_${k}.txt`), dump.join('\n'), 'utf8')
  }
}
console.log('\nraw json 已落盘到 temp_preview/raw_*.json')
