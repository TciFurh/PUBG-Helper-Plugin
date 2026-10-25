/**
 * 统一入口 —— #和平 <功能> [参数]
 *
 * 不需要记一长串指令：把功能名当第一个参数即可，
 * 例如「#和平 战绩 排位」「#和平 资产 时装 粉色」「#和平 手册」。
 *
 * 实现方式：按功能找到对应插件实例的方法，把 e.msg 改写成该插件的规范指令后直接调用，
 * 各插件自己的参数解析逻辑保持原样，互不侵入。
 */
import loader from '../../../lib/core/loader.js'

const ROUTES = [
  { names: ['战绩', '对局'], file: 'battleList.js', run: (r) => (r ? ['showCategory', `#和平战绩 ${r}`] : ['showOverview', '#和平战绩']) },
  { names: ['最近', '最近战绩'], file: 'recentBattle.js', run: (r) => ['showRecentBattle', `#和平最近战绩${(r || '').replace(/\s+/g, '')}`] },
  { names: ['详情', '战绩详情'], file: 'recentBattle.js', run: (r) => ['showBattleDetail', `#和平战绩详情${String(r || '').replace(/\s+/g, '')}`] },
  { names: ['资产', '仓库'], file: 'assetAndSign.js', run: (r) => ['showAsset', `#和平资产${r ? ' ' + r : ''}`] },
  { names: ['签到'], file: 'assetAndSign.js', run: () => ['dailySignin', '#和平签到'] },
  { names: ['任务', '每日任务'], file: 'campTask.js', run: () => ['doTasks', '#和平任务'] },
  { names: ['任务状态'], file: 'campTask.js', run: () => ['taskStatus', '#和平任务状态'] },
  { names: ['手册', '周任务'], file: 'campTask.js', run: () => ['weeklyStatus', '#和平周任务'] },
  { names: ['完成手册', '做手册'], file: 'campTask.js', run: () => ['doWeeklyTasks', '#完成手册任务'] },
  { names: ['领取', '领积分', '领奖'], file: 'campTask.js', run: (r) => ['claimWeekly', `#领取手册奖励${r ? ' ' + r : ''}`] },
  {
    names: ['自动任务'], file: 'campTask.js',
    run: (r) => {
      if (/关|停|off/i.test(r)) return ['disableAuto', '#关闭和平自动任务']
      return ['enableAuto', '#开启和平自动任务']
    },
  },
  { names: ['周报'], file: 'weeklyReport.js', run: () => ['showWeeklyReport', '#和平周报'] },
  { names: ['营地币', '福利币'], file: 'campSocial.js', run: () => ['coins', '#和平营地币'] },
  { names: ['访客'], file: 'campSocial.js', run: () => ['visits', '#和平访客'] },
  { names: ['好友', '在线好友'], file: 'campSocial.js', run: () => ['onlineFriends', '#和平在线好友'] },
  { names: ['赛事'], file: 'campSocial.js', run: () => ['leagues', '#和平赛事'] },
  { names: ['主页'], file: 'myHomepage.js', run: (r) => ['showMyHomepage', `#和平主页${(r || '').replace(/\s+/g, '')}`] },
  {
    names: ['账号'], file: 'accountManager.js',
    run: (r) => (r && /^\d+$/.test(r) ? ['switchAccount', `#切换和平账号 ${r}`] : ['myCamps', '#和平账号']),
  },
  { names: ['印记', '王牌印记'], file: 'aceBadges.js', run: () => ['aceBadges', '#王牌印记'] },
  { names: ['熟练度'], file: 'marksmanshipSkills.js', run: (r) => (r ? ['marksmanshipSkillsByType', `#枪械熟练度 ${r}`] : ['marksmanshipSkills', '#枪械熟练度']) },
  { names: ['资讯'], file: 'news.js', run: (r) => ['showNews', `#和平资讯${(r || '').replace(/\s+/g, '')}`] },
  { names: ['凭证'], file: 'login.js', run: () => ['viewCred', '#和平凭证'] },
  { names: ['提取', '导出'], file: 'extractCred.js', run: (r) => ['extract', `#提取凭证${r ? ' ' + r : ''}`] },
  { names: ['帮助', '菜单', 'help'], file: 'help.js', run: () => ['showHelp', '#和平帮助'] },
  { names: ['详解', '说明'], file: 'details.js', run: (r) => ['showDetail', `#和平详解${r ? ' ' + r : ''}`] },
]

const TOPIC = ROUTES.map((r) => r.names[0])

function findEntry(file) {
  const list = loader?.priority || []
  return list.find((i) => String(i.key || '').endsWith(file)) || null
}

export class Hub extends plugin {
  constructor() {
    super({
      name: '[PHP]统一入口',
      dsc: '和平 <功能> [参数]：一个入口触发全部功能',
      event: 'message',
      priority: 5,
      rule: [
        { reg: '^#?和平\\s+(\\S+)\\s*(.*)$', fnc: 'dispatch' },
      ],
    })
  }

  async dispatch(e) {
    const m = String(e.msg || '').match(/^#?和平\s+(\S+)\s*(.*)$/)
    const sub = (m && m[1] ? m[1] : '').trim()
    const rest = (m && m[2] ? m[2] : '').trim()

    const route = ROUTES.find((r) => r.names.includes(sub))
    if (!route) {
      const lines = [
        `没有「${sub}」这个功能`,
        '',
        '可用：' + TOPIC.join(' / '),
        '',
        '例：#和平 战绩 排位　#和平 资产 时装 粉色　#和平 手册',
        '完整菜单：#和平帮助　功能详解：#和平详解',
      ]
      return e.reply(lines.join('\n'))
    }

    const [fnc, msg] = route.run(rest)
    const entry = findEntry(route.file)
    if (!entry) return e.reply('该功能未加载成功，请检查插件日志或稍后重试')

    // 参照框架分发逻辑：克隆实例但不重新走构造函数，避免重复注册规则
    const inst = Object.assign(Object.create(entry.class.prototype), entry.plugin || {})
    const oldMsg = e.msg
    e.msg = msg
    try {
      await inst[fnc](e)
    } catch (err) {
      e.reply(`❌ 执行「${sub}」失败：` + (err.message || err))
    } finally {
      e.msg = oldMsg
    }
  }
}
