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

/** 中文序号，晋级赛最多几局，够用 */
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
function cnNum(n) {
  return n >= 0 && n <= 10 ? CN_NUM[n] : String(n)
}

/**
 * 晋级赛角标。
 *
 * 接口 `promotion` 字段：{ taskId, process, target, pass, protect, rank, divId, divName }
 * - `process/target` 是晋级进度（已打几局 / 需要几局），每赢一局 +1，保护局不加
 * - `divName` 只在「这一局刚升上去」时才有值（如「卓越王牌」），其它局靠 taskId 反推：
 *   20001 = 卓越王牌晋级任务（实测）
 * - 卓越王牌是紫色角标、文字「晋级卓越王牌」（营地 App 同款），普通王牌是金色「晋级赛·成功」
 *
 * 返回值除了角标（small/big/tone），还带 `label`（整串文案，详情页用）和
 * `step`（进度文案，如「卓越第三局 · 3/3」）。
 */
export function promoMeta(p) {
  if (!p || !p.taskId) return null
  const passed = String(p.pass) === '1' || Number(p.pass) === 1
  const protect = String(p.protect) === '1' || p.protect === true
  const proc = p.process != null ? Number(p.process) : null
  const target = p.target != null ? Number(p.target) : null
  const progress = proc != null && target != null ? `${proc}/${target}` : ''
  const percent = proc != null && target ? Math.min(100, Math.round((proc / target) * 100)) : 0

  const tier = p.divName || (Number(p.taskId) === 20001 ? '卓越王牌' : '')
  const isTop = /卓越/.test(tier)
  const tierPrefix = isTop ? '卓越' : ''
  const stepText = proc != null && proc > 0 ? `${tierPrefix}第${cnNum(proc)}局` : ''
  const step = stepText
    ? { text: stepText, progress, tone: passed ? (isTop ? 'purple' : 'gold') : 'grey' }
    : null

  if (passed) {
    return isTop
      ? { small: '晋级', big: '卓越王牌', tone: 'purple', label: '晋级卓越王牌', progress, percent, step }
      : { small: '晋级赛', big: '成功', tone: 'gold', label: '晋级赛 · 成功', progress, percent, step }
  }
  if (protect) {
    return { small: '晋级赛', big: '保护', tone: 'grey', label: '晋级赛 · 保护', progress, percent, step }
  }
  return { small: '晋级赛', big: '失败', tone: 'grey', label: '晋级赛 · 失败', progress, percent, step }
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
