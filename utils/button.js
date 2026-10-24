/**
 * 官方 QQ Bot 按钮
 *
 * segment.button(...行) 每个参数是一行，行内是按钮数组。
 * - callback: 点击后直接以该文本触发指令
 * - input:    点击后把文本填进输入框，等用户补参数再发
 * 非 QQBot 适配器（OneBot 等）会自动忽略 button 段，不影响其他平台。
 *
 * ⚠️ callback 文本必须能被 apps 里的 reg 命中：
 *    #和平战绩详情1 / #和平主页123 / #和平最近战绩10 这类是「无空格」正则，别加空格。
 */
export default class Button {
  /** 帮助（图片/文本版通用）：总入口 */
  static help() {
    return segment.button(
      [
        { text: '🔐 QQ登录', callback: '#和平QQ登录' },
        { text: '💬 微信登录', callback: '#和平微信登录' },
        { text: '👤 我的账号', callback: '#和平账号' }
      ],
      [
        { text: '🏠 主页', callback: '#和平主页' },
        { text: '⚔️ 全部战绩', callback: '#和平战绩' },
        { text: '🆕 最近战绩', callback: '#和平最近战绩' }
      ],
      [
        { text: '📊 周报', callback: '#和平周报' },
        { text: '🎯 周任务', callback: '#和平周任务' },
        { text: '✅ 每日任务状态', callback: '#和平任务状态' }
      ],
      [
        { text: '💰 资产', callback: '#和平资产' },
        { text: '🪙 营地币', callback: '#和平营地币' },
        { text: '📆 签到', callback: '#和平签到' }
      ]
    )
  }

  /** 未登录引导：出现在所有「未找到营地登录凭证」提示里 */
  static bind() {
    return segment.button(
      [
        { text: '🔐 QQ扫码登录', callback: '#和平QQ登录' },
        { text: '💬 微信扫码登录', callback: '#和平微信登录' }
      ],
      [
        { text: '抓包教程', callback: '#和平登录' },
        { text: '粘贴凭证', input: '#提交和平 ' }
      ]
    )
  }

  /** 账号管理（#和平账号 / #我的和平ID） */
  static account() {
    return segment.button(
      [
        { text: '我的角色', callback: '#我的和平ID' },
        { text: '切换账号', input: '#切换和平账号 ' },
        { text: '删除账号', input: '#删除和平账号 ' }
      ],
      [
        { text: '切换角色', input: '#切换和平 ' },
        { text: '微信登录', callback: '#和平微信登录' },
        { text: 'QQ登录', callback: '#和平QQ登录' }
      ]
    )
  }

  /** 个人主页 / 周报 */
  static homepage() {
    return segment.button(
      [
        { text: '⚔️ 全部战绩', callback: '#和平战绩' },
        { text: '🆕 最近战绩', callback: '#和平最近战绩' },
        { text: '📊 周报', callback: '#和平周报' }
      ],
      [
        { text: '💰 资产', callback: '#和平资产' },
        { text: '🪙 营地币', callback: '#和平营地币' },
        { text: '📆 签到', callback: '#和平签到' }
      ]
    )
  }

  /** 战绩总览（#和平战绩）：分类直达 */
  static overview() {
    return segment.button(
      [
        { text: '排位战绩', callback: '#和平战绩 排位' },
        { text: '地铁战绩', callback: '#和平战绩 地铁' },
        { text: '团竞战绩', callback: '#和平战绩 团竞' }
      ],
      [
        { text: '古墓战绩', callback: '#和平战绩 古墓' },
        { text: '绿洲战绩', callback: '#和平战绩 绿洲' },
        { text: '🆕 最近战绩', callback: '#和平最近战绩' }
      ]
    )
  }

  /**
   * 分类战绩列表
   * @param {string} tab 分类中文名（排位/地铁/团竞…）
   * @param {number} page 当前页码
   * @param {boolean} hasMore 是否还有下一页
   */
  static category(tab, page, hasMore) {
    const rows = [[{ text: '看单局详情', input: '#和平战绩详情' }]]
    if (hasMore) rows[0].push({ text: `下一页(${page + 1})`, callback: `#和平战绩 ${tab} ${page + 1}` })
    rows[0].push({ text: '返回总览', callback: '#和平战绩' })
    const others = ['排位', '地铁', '团竞', '古墓'].filter((t) => t !== tab)
    rows.push(others.map((t) => ({ text: `${t}战绩`, callback: `#和平战绩 ${t}` })))
    return segment.button(...rows)
  }

  /**
   * 最近战绩列表：第 N 场直达详情
   * @param {number} count 本次返回的场次数
   */
  static recent(count = 0) {
    const rows = []
    const detail = []
    for (let i = 1; i <= Math.min(5, count); i++) detail.push({ text: `第${i}场`, callback: `#和平战绩详情${i}` })
    if (detail.length) rows.push(detail)
    rows.push([
      { text: '刷新列表', callback: '#和平最近战绩' },
      { text: '🏠 主页', callback: '#和平主页' },
      { text: '⚔️ 全部战绩', callback: '#和平战绩' }
    ])
    return segment.button(...rows)
  }

  /** 单局详情：回列表 */
  static battleDetail() {
    return segment.button([
      { text: '返回最近战绩', callback: '#和平最近战绩' },
      { text: '🏠 主页', callback: '#和平主页' },
      { text: '⚔️ 全部战绩', callback: '#和平战绩' }
    ])
  }

  /** 手册周任务状态卡 */
  static weekly() {
    return segment.button(
      [
        { text: '▶ 执行手册任务', callback: '#完成手册任务' },
        { text: '🎁 领取全部奖励', callback: '#领取手册奖励' }
      ],
      [
        { text: '刷新状态', callback: '#和平周任务' },
        { text: '✅ 每日任务状态', callback: '#和平任务状态' }
      ]
    )
  }

  /** 手册任务执行结果 */
  static weeklyRun() {
    return segment.button(
      [
        { text: '🎁 领取全部奖励', callback: '#领取手册奖励' },
        { text: '刷新状态', callback: '#和平周任务' }
      ],
      [
        { text: '✅ 每日任务状态', callback: '#和平任务状态' },
        { text: '🏠 主页', callback: '#和平主页' }
      ]
    )
  }

  /** 领奖结果 */
  static claim() {
    return segment.button([
      { text: '刷新状态', callback: '#和平周任务' },
      { text: '▶ 执行手册任务', callback: '#完成手册任务' }
    ])
  }

  /** 营地每日任务结果 / 状态 */
  static daily() {
    return segment.button(
      [
        { text: '刷新状态', callback: '#和平任务状态' },
        { text: '🎯 周任务状态', callback: '#和平周任务' },
        { text: '▶ 完成手册任务', callback: '#完成手册任务' }
      ],
      [
        { text: '💰 资产', callback: '#和平资产' },
        { text: '📆 签到', callback: '#和平签到' }
      ]
    )
  }

  /** 仓库资产 */
  static assets() {
    return segment.button([
      { text: '🪙 营地币', callback: '#和平营地币' },
      { text: '📆 签到', callback: '#和平签到' },
      { text: '🏠 主页', callback: '#和平主页' }
    ])
  }

  /** 营地币 */
  static coins() {
    return segment.button([
      { text: '💰 资产', callback: '#和平资产' },
      { text: '📆 签到', callback: '#和平签到' },
      { text: '🎯 周任务', callback: '#和平周任务' }
    ])
  }

  /** 签到详情 */
  static signin() {
    return segment.button([
      { text: '✅ 每日任务状态', callback: '#和平任务状态' },
      { text: '🪙 营地币', callback: '#和平营地币' },
      { text: '🏠 主页', callback: '#和平主页' }
    ])
  }

  /**
   * 资讯列表：前 5 条直达详情
   * @param {number} count 本次列表条数
   */
  static news(count = 0) {
    const rows = []
    const picks = []
    for (let i = 1; i <= Math.min(5, count); i++) picks.push({ text: `第${i}条`, callback: `#和平资讯${i}` })
    if (picks.length) rows.push(picks)
    rows.push([{ text: '刷新列表', callback: '#和平资讯' }, { text: '🏅 赛事', callback: '#和平赛事' }])
    return segment.button(...rows)
  }
}
