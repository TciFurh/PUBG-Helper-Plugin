/**
 * 战绩展示公共格式化：列表与详情共用，避免两处逻辑漂移。
 * 配色沿用营地/游戏内 UI 语言：成功/胜利=金，失败=灰，负增益=红。
 */

/** 营地字段常包一层 { v }，统一取值 */
export function val(v) {
  if (v && typeof v === 'object') return v.v
  return v
}

/** 千分位数字 */
export function fmtNum(n) {
  const v = Number(n)
  if (!isFinite(v)) return n == null || n === '' ? '—' : String(n)
  return v.toLocaleString('en-US')
}

/**
 * 收益/价值：上万才换算「万」，负数保留，0 显示 —
 * 4773100 → 477万 ｜ -60000 → -6万 ｜ 4128 → 4,128
 */
export function fmtWan(n) {
  const v = Number(n)
  if (!isFinite(v) || v === 0) return '—'
  if (Math.abs(v) < 10000) return v.toLocaleString('en-US')
  const w = v / 10000
  const abs = Math.abs(w)
  const s = abs >= 100 ? Math.round(w) : Number(w.toFixed(1))
  return `${s}万`
}

/** 装备/物资品质 → 颜色（101~108，来自地铁逃生 item.quality） */
const QUALITY_COLOR = {
  101: '#9CA3AF',
  102: '#4ADE80',
  103: '#3B82F6',
  104: '#A855F7',
  105: '#EC4899',
  106: '#F5C451',
  107: '#EF4444',
  108: '#FB7185',
}

export function qualityColor(q) {
  return QUALITY_COLOR[Number(q)] || QUALITY_COLOR[101]
}

/** 晋级赛角标：成功=金 / 失败=灰 */
export function promoMeta(p) {
  if (!p || !p.taskId) return null
  const passed = String(p.pass) === '1' || Number(p.pass) === 1
  const protect = String(p.protect) === '1' || p.protect === true
  const proc = p.process != null ? Number(p.process) : null
  const target = p.target != null ? Number(p.target) : null
  const progress = proc != null && target != null ? `${proc}/${target}` : ''
  const percent = proc != null && target ? Math.min(100, Math.round((proc / target) * 100)) : 0
  if (passed) return { small: '晋级赛', big: '成功', tone: 'gold', progress, percent }
  if (protect) return { small: '晋级赛', big: '保护', tone: 'grey', progress, percent }
  return { small: '晋级赛', big: '失败', tone: 'grey', progress, percent }
}

/** 对局结果文案：团竞/地铁共用 result 枚举 */
const RESULT_TEXT = {
  Win: '胜',
  Lose: '败',
  Fail: '败',
  Landslide: '胜',
  Draw: '平',
  Escape: '成功',
  Escaped: '成功',
  Dead: '失败',
}

export function resultText(result) {
  if (!result) return ''
  return RESULT_TEXT[result] || String(result)
}

/** 结果色调：胜/成功=金，败=灰 */
export function resultTone(result) {
  const t = resultText(result)
  if (t === '胜' || t === '成功') return 'gold'
  if (t === '败' || t === '失败') return 'grey'
  return 'grey'
}

/**
 * 列表行左侧结果块：
 * - 地铁：小字 hardType（进阶常规/基础常规），大字 成功/失败
 * - 团竞：小字 团竞排位/团竞，大字 胜/败
 * 判定依据：地铁一定带 hardType，团竞一定带 result，两者互斥。
 */
export function rowStatus(it) {
  if (it.hardType) {
    const text = it.result === 'Win' ? '成功' : it.result === 'Lose' ? '失败' : resultText(it.result) || '—'
    return { small: it.hardType, big: text, tone: it.result === 'Win' ? 'gold' : 'grey' }
  }
  if (it.result) {
    const text = resultText(it.result)
    if (!text) return null
    return { small: Number(it.isRanking) ? '团竞排位' : '团竞', big: text, tone: resultTone(it.result) }
  }
  return null
}
