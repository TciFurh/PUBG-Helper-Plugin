// 战绩列表共享缓存：供 #和平最近战绩 / #和平战绩 列表查询后，由 #和平战绩详情 按编号取 battleId/battleMode
const cache = { userId: null, roleId: null, list: [], source: '' }

export function setBattleCache(userId, roleId, list, source = 'recent') {
  cache.userId = userId
  cache.roleId = roleId
  cache.list = Array.isArray(list) ? list : []
  cache.source = source
}

export function getBattleCache() {
  return cache
}
