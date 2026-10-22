/**
 * 和平营地「福利中心」每日任务自动完成。
 *
 * ## 接口来源
 * 营地 APP 抓包 + 反编译（apktool 解包）交叉验证，并参考开源实现 HdShare/GameHelperAction；
 * 2026-10-23 用本插件凭证实测全链路通过（做动作 → 状态翻转 → 领取到奖励）。
 *
 * ## 两套任务
 * - **积分任务**（签到页那份 10 条，taskId 26-36）：完成即自动入账，status 0→2；
 *   status==1 理论上存在（完成未上报），调 completescoretask 兜底。
 * - **福利任务**（每天 3 条，taskId 1001-1014，可刷新）：status 0=未做 1=做完可领 2=已领，
 *   领奖走 welfare/completetask.php，实测能领到 福利币 / 营地装饰碎片。
 *
 * ## 能自动做 / 不能自动做
 * | 任务 | 做法 |
 * |---|---|
 * | 点赞资讯 ×3 | 拉资讯流 → `/user/addlike` ×3 |
 * | 点赞动态 ×3 | 拉动态广场 → `/moment/like` ×3 |
 * | 浏览资讯 5 分钟 | `/game/batchmodulelogreport` 上报浏览埋点（服务端只认这个） |
 * | 观看直播 / PEL 直播 5 分钟 | 同上，换 eventId |
 * | 分享资讯 / 资产 / 战绩 / 复盘 / 周报 | `/user/sharecallback`（客户端分享服务端收不到回调，按了就算） |
 * | 浏览攻略专区 | `/game/getstationhome` |
 * | 观看战绩复盘 | `/h5/getpubgreplaydata4.php` |
 * | 启用对局工具 | `/play/gametoolchange`（会真的打开工具，可在 App 里关掉） |
 * | 充能资讯 | 充能榜 → `/game/recharge` |
 * | 启动游戏 / 取胜一局 / 好友观战 | **做不了**（要真实游戏行为），依赖福利任务刷新换掉 |
 *
 * ## 社交痕迹
 * 点赞是写操作：做完任务后把**本次点过的**那条取消（只撤自己点的，不动历史点赞）。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 埋点上报一版的公共字段（interval 5 分钟 × 12 条 = 模拟在线时长） */
const REPORT_TEMPLATES = {
  30: { eventId: 100004, subModuleId: 27, page: 101004, moduleId: 1 }, // 浏览资讯
  31: { eventId: 10901001, subModuleId: 1, page: 109002, moduleId: 9 }, // 观看直播
  36: { eventId: 400016, subModuleId: 26, page: 102004, moduleId: 9 }, // PEL 赛事直播
  1010: { eventId: 100004, subModuleId: 27, page: 101004, moduleId: 1 },
}
const REPORT_POSTS = 5
const REPORT_BATCH = 12

/** 没法自动化的任务（要真实游戏行为） */
const CANNOT_AUTO = {
  26: '需真实启动游戏',
  27: '需真实取胜一局',
  1001: '需真实启动游戏',
  1002: '需真实获得胜利',
  1014: '需真实好友观战',
}

async function ok(api, p) {
  return p && Number(p.returnCode) === 0 ? p : null
}

/** 动作实现。都返回 { ok, note }；失败不抛异常，由调用方汇总。 */
const ACTIONS = {
  async shareInfo({ api }) {
    return ok(api, await api.share_callback('shareInfo', '1')) ? { ok: true } : { ok: false, note: '分享回调失败' }
  },
  async shareAssets({ api }) {
    return ok(api, await api.share_callback('shareAssets', '')) ? { ok: true } : { ok: false, note: '分享回调失败' }
  },
  async shareMatch({ api }) {
    return ok(api, await api.share_callback('shareMatch', '')) ? { ok: true } : { ok: false, note: '分享回调失败' }
  },
  async shareReplay({ api }) {
    return ok(api, await api.share_callback('shareH5', 'https://c.gp.qq.com/reviewV4/'))
      ? { ok: true }
      : { ok: false, note: '分享回调失败' }
  },
  async shareWeekly({ api }) {
    return ok(api, await api.share_callback('shareH5', 'https://c.gp.qq.com/camp/weekly/index'))
      ? { ok: true }
      : { ok: false, note: '分享回调失败' }
  },
  async station({ api }) {
    return ok(api, await api.get_station_home()) ? { ok: true } : { ok: false, note: '攻略专区拉取失败' }
  },
  async replay({ api }) {
    return ok(api, await api.get_replay_data()) ? { ok: true } : { ok: false, note: '复盘数据拉取失败' }
  },
  /** 点赞资讯 ×3（ctx 里缓存资讯列表，多条任务共用一次拉取） */
  async likeInfo({ api, state }) {
    if (!state.infoIds) {
      const res = await ok(api, await api.get_info_main_page())
      state.infoIds = (res?.data?.list || []).map((x) => x.iInfoId).filter(Boolean).slice(0, 3)
    }
    if (state.infoIds.length < 3) return { ok: false, note: '资讯流不足 3 条' }
    let n = 0
    for (const id of state.infoIds) {
      const r = await ok(api, await api.add_info_like(id, '1'))
      if (r) {
        n++
        state.likedInfo.push(id)
      }
      await sleep(400)
    }
    return n === 3 ? { ok: true } : { ok: false, note: `只点赞成功 ${n}/3` }
  },
  /** 点赞动态 ×3 */
  async likeMoment({ api, state }) {
    if (!state.momentIds) {
      const res = await ok(api, await api.get_square_moments())
      state.momentIds = (res?.data?.list || []).map((x) => x.momentId).filter(Boolean).slice(0, 3)
    }
    if (state.momentIds.length < 3) return { ok: false, note: '动态广场不足 3 条' }
    let n = 0
    for (const id of state.momentIds) {
      const r = await ok(api, await api.add_moment_like(id, '1'))
      if (r) {
        n++
        state.likedMoment.push(id)
      }
      await sleep(400)
    }
    return n === 3 ? { ok: true } : { ok: false, note: `只点赞成功 ${n}/3` }
  },
  /** 埋点上报类：浏览 5 分钟 / 看直播 5 分钟 / PEL 直播 */
  async report(taskId, { api }) {
    const tpl = REPORT_TEMPLATES[taskId]
    if (!tpl) return { ok: false, note: '无该任务的埋点配置' }
    const extData = Array.from({ length: REPORT_BATCH }, () => ({ ...tpl, reportInterval: 5 }))
    let n = 0
    for (let i = 0; i < REPORT_POSTS; i++) {
      const r = await ok(api, await api.batch_module_report(extData))
      if (r) n++
      await sleep(500)
    }
    return n === REPORT_POSTS ? { ok: true } : { ok: false, note: `上报成功 ${n}/${REPORT_POSTS}` }
  },
  /** 启用工具（积分任务 33 用 4 号，福利 1011 要开满 4 个） */
  async tool({ api }, count = 1, startId = 4) {
    let n = 0
    for (let i = 0; i < count; i++) {
      const r = await ok(api, await api.change_game_tool(startId + i, '1'))
      if (r) n++
      await sleep(400)
    }
    return n === count ? { ok: true, note: '工具已打开，可在 App 里关闭' } : { ok: false, note: `只开启 ${n}/${count}` }
  },
  async tool1(ctx) {
    return ACTIONS.tool(ctx, 1, 4)
  },
  async tool4(ctx) {
    return ACTIONS.tool(ctx, 4, 0)
  },
  /** 充能资讯 1 次 */
  async recharge({ api }) {
    const rank = await ok(api, await api.get_recharge_rank())
    const first = (rank?.data?.list || []).find((x) => x.iInfoId)
    if (!first) return { ok: false, note: '充能榜无可充能资讯' }
    return ok(api, await api.recharge_info(first.iInfoId, '1')) ? { ok: true } : { ok: false, note: '充能失败' }
  },
}

/** 积分任务 taskId → 动作 */
const SCORE_ACTIONS = {
  28: (c) => ACTIONS.likeInfo(c),
  29: (c) => ACTIONS.likeMoment(c),
  30: (c) => ACTIONS.report(30, c),
  31: (c) => ACTIONS.report(31, c),
  33: (c) => ACTIONS.tool1(c),
  34: (c) => ACTIONS.shareInfo(c),
  35: (c) => ACTIONS.shareWeekly(c),
  36: (c) => ACTIONS.report(36, c),
}

/** 福利任务 taskId → 动作 */
const WELFARE_ACTIONS = {
  1003: (c) => ACTIONS.shareAssets(c),
  1004: (c) => ACTIONS.shareReplay(c),
  1005: (c) => ACTIONS.shareMatch(c),
  1006: (c) => ACTIONS.shareInfo(c),
  1007: (c) => ACTIONS.recharge(c),
  1008: (c) => ACTIONS.station(c),
  1009: (c) => ACTIONS.replay(c),
  1010: (c) => ACTIONS.report(1010, c),
  1011: (c) => ACTIONS.tool4(c),
  1012: (c) => ACTIONS.likeInfo(c),
  1013: (c) => ACTIONS.likeMoment(c),
}

/** 做一批积分任务里未完成的（只动 status==0 且可自动化的） */
async function actScoreTasks(api, roleId, state, score) {
  const rows = []
  for (const t of score?.data?.taskList || []) {
    const id = Number(t.taskId)
    const name = t.detailDesc || `任务${id}`
    const st = Number(t.status)
    if (st !== 0) {
      rows.push({ id, name, status: st === 2 ? 'done' : 'done', note: st === 2 ? '已完成' : '已完成' })
      continue
    }
    const fn = SCORE_ACTIONS[id]
    if (!fn) {
      rows.push({ id, name, status: 'skip', note: CANNOT_AUTO[id] || '暂不支持自动完成' })
      continue
    }
    const r = await fn({ api, roleId, state })
    rows.push({ id, name, status: r.ok ? 'acted' : 'fail', note: r.note || '' })
    await sleep(600)
  }
  return rows
}

/** 做一批福利任务里未完成的 */
async function actWelfareTasks(api, roleId, state, welfare) {
  const rows = []
  for (const t of welfare?.data?.tasks || []) {
    const id = Number(t.taskId)
    const name = t.title || t.detailDesc || `任务${id}`
    const st = Number(t.status)
    if (st === 2) {
      rows.push({ id, index: t.index, name, status: 'done', note: '已领取' })
      continue
    }
    if (st !== 0) continue
    const fn = WELFARE_ACTIONS[id]
    if (!fn) {
      rows.push({ id, index: t.index, name, status: 'skip', note: CANNOT_AUTO[id] || '暂不支持自动完成' })
      continue
    }
    const r = await fn({ api, roleId, state })
    rows.push({ id, index: t.index, name, status: r.ok ? 'acted' : 'fail', note: r.note || '' })
    await sleep(600)
  }
  return rows
}

/** 领取福利任务里 status==1 的奖励 */
async function claimWelfare(api, roleId, welfare) {
  const claimed = []
  for (const t of welfare?.data?.tasks || []) {
    if (Number(t.status) !== 1) continue
    const r = await api.complete_welfare_task(t.index, roleId)
    if (Number(r?.returnCode) === 0) {
      const d = r.data || {}
      claimed.push(`${d.rewardName || '奖励'}${d.rewardCount ? `×${d.rewardCount}` : ''}`)
    }
    await sleep(500)
  }
  return claimed
}

/** 领活跃度礼包（status==1 才可领） */
async function claimGifts(api, roleId, score) {
  const claimed = []
  for (const g of score?.data?.liveness?.livenessGiftList || []) {
    if (Number(g.status) !== 1) continue
    const r = await api.receive_liveness_gift(g.giftId, roleId)
    if (Number(r?.returnCode) === 0) claimed.push(g.giftTitle || `礼包${g.giftId}`)
    await sleep(500)
  }
  return claimed
}

/** 撤销本次为任务点的赞（只撤自己刚点的，历史点赞不动） */
async function revokeTodayLikes(api, state) {
  let n = 0
  for (const id of state.likedInfo) {
    if (await ok(api, await api.add_info_like(id, '0'))) n++
    await sleep(300)
  }
  for (const id of state.likedMoment) {
    if (await ok(api, await api.add_moment_like(id, '0'))) n++
    await sleep(300)
  }
  return n
}

/**
 * 跑一遍全部每日任务。
 * @returns {Promise<{score: Array, welfare: Array, gifts: string[], rewards: string[], likesCleared: number, refreshCount: number, liveness: string}>}
 */
export async function runDailyTasks(api, roleId, { clearLikes = true, allowRefresh = true } = {}) {
  const state = { likedInfo: [], likedMoment: [] }
  const out = { score: [], welfare: [], gifts: [], rewards: [], likesCleared: 0, refreshCount: 0, liveness: '', rounds: 0, welfareActed: 0 }

  // ---- 积分任务 ----
  const score1 = await api.get_score_tasklist(roleId)
  out.score = await actScoreTasks(api, roleId, state, score1)
  // 完成后可能有 status==1（完成待上报）的，兜底上报一次
  const score2 = await api.get_score_tasklist(roleId)
  for (const t of score2?.data?.taskList || []) {
    if (Number(t.status) === 1) {
      const r = await api.complete_score_task(t.taskId, roleId)
      const row = out.score.find((x) => x.id === Number(t.taskId))
      if (row) row.note = Number(r?.returnCode) === 0 ? '已上报领取' : '上报失败'
      await sleep(500)
    }
  }
  out.gifts = await claimGifts(api, roleId, score2)
  const lv = score2?.data?.liveness || {}
  out.liveness = lv.current != null ? `${lv.current}/${lv.total ?? 100}` : ''

  // ---- 福利任务（主动刷新循环：做 → 领 → 刷新 → 再做 → 再领） ----
  // refreshCount 是「已刷新次数」的负数计数（-1、-2…），不是剩余上限；
  // 能不能刷只有试了才知道：次数用尽时 refreshtask 回 -76504。
  // 刷出来的新任务里常有「服务端已判定完成、可直接领」的（它知道你今天做过什么），
  // 所以每轮做完就刷下一轮，直到接口拒绝或达到轮次上限。
  const MAX_ROUNDS = allowRefresh ? 10 : 1
  let welfare = await api.get_welfare_tasklist(roleId)
  let rounds = 0
  let actedTotal = 0
  while (welfare && rounds < MAX_ROUNDS) {
    rounds++
    const acted = await actWelfareTasks(api, roleId, state, welfare)
    actedTotal += acted.filter((r) => r.status === 'acted').length
    out.welfare = acted

    welfare = await api.get_welfare_tasklist(roleId)
    out.rewards.push(...(await claimWelfare(api, roleId, welfare)))

    const r = await api.refresh_welfare_task(roleId)
    if (Number(r?.returnCode) !== 0 || !r?.data?.tasks) {
      // -76504 = 今日刷新次数用尽；不管哪种原因，取一次最终列表兜底后收工
      welfare = await api.get_welfare_tasklist(roleId)
      break
    }
    welfare = r
    await sleep(1200)
  }
  out.rounds = rounds
  out.welfareActed = actedTotal
  out.refreshCount = Math.abs(Number(welfare?.data?.refreshCount ?? 0))

  if (clearLikes) out.likesCleared = await revokeTodayLikes(api, state)
  return out
}
