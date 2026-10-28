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
 * 实测语义（2026-10 排位数据，对照游戏内实际段位核对）：
 * - `pass=1` 只表示「这一局赢了」——中间胜局同样是 pass=1，别拿它当最终局标志
 * - **`taskId` 才决定这次晋级的目标段位**：20001→卓越王牌(3局) / 20002→传奇王牌(4局) /
 *   20003→绝世王牌(5局)。`divName` 是**当前所在段位**（如打传奇晋级赛时 divName=卓越王牌），
 *   不能直接当目标用，否则会出现「在打传奇却显示卓越」的错位
 * - `divName`/`divId` 只在打完整场晋级赛的最终局才有值（打满局数时出现），可作最终局判据之一
 * - `protect=1` 是保护局（输了但抵消一次）
 * - `result` 字段在列表接口里是 undefined，中间局胜负只能靠 pass/protect 推
 *
 * 配色（按段位，营地 App 同款）：
 * - 最终局：绝世 → 红 / 传奇 → 橙 / 卓越王牌 → 紫（文字「晋级绝世王牌」这类整串），
 *   普通段位 → 金「晋级赛·成功」
 * - 中间胜局（第一局/第二局赢了）→ 金「晋级赛·成功」
 * - 保护局 / 中间败局 → 灰
 * - divName 缺失的最终局按 taskId 反推（20001 = 卓越王牌，实测）
 *
 * 返回值除了角标（small/big/tone），还带 `label`（整串文案，详情页用）和
 * `step`（进度文案，如「卓越第三局 · 3/3」）。
 */
const PROMO_TIER_TONES = [
  { re: /绝世/, tone: 'red' },
  { re: /传奇/, tone: 'orange' },
  { re: /卓越/, tone: 'purple' },
]

/** 晋级任务 ID → 目标段位（局数：卓越 3 / 传奇 4 / 绝世 5） */
const PROMO_TASK_TIER = { 20001: '卓越王牌', 20002: '传奇王牌', 20003: '绝世王牌' }

/** 晋级目标段位：优先按 taskId 反推；未知 taskId 时用 divName（当前段位）推下一档 */
function promoTargetTier(p) {
  const byTask = PROMO_TASK_TIER[Number(p.taskId)]
  if (byTask) return byTask
  const name = p.divName || ''
  if (!name) return ''
  const order = ['卓越王牌', '传奇王牌', '绝世王牌', '无敌战神']
  const i = order.indexOf(name)
  return i >= 0 && i + 1 < order.length ? order[i + 1] : name
}

export function promoMeta(p) {
  if (!p || !p.taskId) return null
  const passed = String(p.pass) === '1' || Number(p.pass) === 1
  const protect = String(p.protect) === '1' || p.protect === true
  const proc = p.process != null ? Number(p.process) : null
  const target = p.target != null ? Number(p.target) : null
  const progress = proc != null && target != null ? `${proc}/${target}` : ''
  const percent = proc != null && target ? Math.min(100, Math.round((proc / target) * 100)) : 0

  const tier = promoTargetTier(p)
  const hit = PROMO_TIER_TONES.find((t) => t.re.test(tier))
  const tierPrefix = tier ? tier.replace(/王牌$/, '') : ''
  // 保护局：process 记的是「已完成的胜局数」，保护发生在胜局之后，
  // 所以它实际是当前系列里的「下一局」——第2局已成功，保护局应显示第3局。
  const stepRound = protect && proc != null ? proc + 1 : proc
  const stepText = stepRound != null && stepRound > 0 ? `${tierPrefix}第${cnNum(stepRound)}局` : ''

  // 最终局 = 这局赢了且进度打满（divName 是「当前段位」，mid-promo 也可能有值，不能单独当判据）
  const clincher = passed && proc != null && target != null && proc >= target

  let small, big, tone
  if (clincher && hit) {
    small = '晋级'
    big = tier
    tone = hit.tone
  } else if (passed) {
    // 中间胜局（第一局/第二局）与普通段位最终局：金色「晋级赛·成功」
    small = '晋级赛'
    big = '成功'
    tone = 'gold'
  } else if (protect) {
    small = '晋级赛'
    big = '保护'
    tone = 'grey'
  } else {
    small = '晋级赛'
    big = '失败'
    tone = 'grey'
  }

  const step = stepText ? { text: stepText, progress, tone } : null
  return {
    small,
    big,
    tone,
    label: clincher && hit ? `晋级${tier}` : `${small} · ${big}`,
    progress,
    percent,
    step,
  }
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
