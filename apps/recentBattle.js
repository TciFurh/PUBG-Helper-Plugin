import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { ApiService } from '../utils/api.js'
import { getCamp, getUserInfo } from '../utils/storage.js'
import { setBattleCache, getBattleCache } from '../utils/battleCache.js'

const apiService = new ApiService()


function val(v) {
  if (v && typeof v === 'object') return v.v
  return v
}

export class RecentBattle extends plugin {
  constructor() {
    super({
      name: '[PHP]最近战绩',
      dsc: '查询最近对局列表与单局战绩详情（需营地登录凭证）',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#和平最近战绩(\\d+)?$', fnc: 'showRecentBattle' },
        { reg: '^#和平战绩详情(\\d+)$', fnc: 'showBattleDetail' },
      ],
    })
  }

  // ---- 最近对局列表 ----
  async showRecentBattle(e) {
    const countArg = (e.msg.match(/^#和平最近战绩(\d+)?$/)?.[1]) || 10
    const count = Math.min(Math.max(Number(countArg) || 10, 1), 30)

    await e.reply(`⏳ 正在查询最近 ${count} 局战绩...`)
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    apiService.useCamp(camp)
    try {
      const roleId = await apiService.get_self_role_id()
      if (!roleId) return e.reply('❌ 未能获取你的营地角色ID，请确认已绑定营地账号')

      const res = await apiService.get_recentbattlelist(roleId, count)
      if (res.returnCode !== 0) return e.reply('❌ 战绩列表获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))

      const list = (res.data && res.data.list) || []
      if (!list.length) return e.reply('最近暂无对局记录')

      // 写入缓存供详情指令使用
      setBattleCache(e.user_id, roleId, list, 'recent')

      const rows = list.map((item, i) => ({
        idx: i + 1,
        modeIcon: item.modeIcon || '',
        modeDesc: item.modeDesc || '',
        mapDesc: item.mapDesc || '',
        teamRank: item.teamRank || '',
        killingCount: item.killingCount ?? '—',
        damageAmount: item.damageAmount ?? '—',
        playTime: item.playTime || '',
        isMvp: Number(item.isMvp) === 1,
        gradeIcon: item.ratingIcon || '',
        gradeText: item.ratingValue || '',
      }))

      const image = await puppeteer.screenshot('recentbattle', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/recentbattle.html',
        roleName: camp.roleName || camp.nickName || roleId,
        total: rows.length,
        rows,
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 最近战绩查询失败：' + (err.message || err))
    }
  }

  // ---- 单局战绩详情 ----
  async showBattleDetail(e) {
    const idxArg = Number(e.msg.match(/^#和平战绩详情(\d+)$/)?.[1])
    const camp = getCamp(e.user_id)
    if (!camp || !camp.token) return e.reply('❌ 未找到营地登录凭证，请先扫码登录（#和平QQ登录 或 #和平微信登录）')

    const battleCache = getBattleCache()
    if (battleCache.userId !== e.user_id || !battleCache.list.length) {
      return e.reply('❌ 请先使用 #和平最近战绩 或 #和平战绩 查询后再查看详情')
    }
    const item = battleCache.list[idxArg - 1]
    if (!item || !item.battleId) return e.reply(`❌ 编号 ${idxArg} 不在最近战绩列表中`)

    await e.reply(`⏳ 正在查询第 ${idxArg} 局详情...`)
    apiService.useCamp(camp)
    try {
      const res = await apiService.get_pubgplaydetail(item.battleId, item.battleMode, battleCache.roleId)
      if (res.returnCode !== 0) return e.reply('❌ 战绩详情获取失败：' + (res.returnMsg || res.returnCode || '未知错误'))

      const d = res.data || {}

      // 能力数据（积分/K·D/淘汰/伤害等）：ability.data.list 为二维数组 [[{k,v,sup},...],...]，拍平取前5
      const abilityList = (d.dataList || []).find((x) => x.type === 'ability')?.data?.list || []
      const abilityFlat = []
      for (const group of abilityList) {
        for (const it of group) abilityFlat.push(it)
      }
      const fights = abilityFlat.slice(0, 5).map((it) => {
        const num = String(val(it.v) ?? '—')
        const sup = it.sup && it.sup.v ? it.sup.v : ''
        return { label: it.k || '', num: sup ? `${num} ${sup}` : num }
      })

      // 武器伤害：equipment.data.list = [{list:[weapon]}]，含命中部位分布
      const eqGroups = (d.dataList || []).find((x) => x.type === 'equipment')?.data?.list || []
      const weapons = []
      for (const g of eqGroups) {
        for (const w of g.list || []) {
          weapons.push({
            name: w.weaponName || '',
            icon: w.weaponIcon || '',
            damage: w.totaldamage ?? '—',
            hitRate: w.hitRate ?? '—',
            critRate: w.critRate ?? '—',
            parts: [
              { k: '头部', v: w.headRate ?? '0.0' },
              { k: '躯干', v: w.bodyRate ?? '0.0' },
              { k: '手部', v: w.handRate ?? '0.0' },
              { k: '四肢', v: w.limbRate ?? '0.0' },
              { k: '脚部', v: w.footRate ?? '0.0' },
            ],
          })
          if (weapons.length >= 3) break
        }
        if (weapons.length >= 3) break
      }

      // 我的队伍：team.data.list = [成员]，infoList 为 [[{k,v:{v,bi}},...],...]
      const teamList = (d.dataList || []).find((x) => x.type === 'team')?.data?.list || []
      const team = teamList.map((m) => {
        const info = {}
        for (const group of m.infoList || []) {
          for (const it of group) info[it.k] = it.v
        }
        return {
          name: m.roleName || '',
          avatar: m.roleIcon || '',
          survivalTime: m.survivalTime || '',
          isMvp: String(m.ismvp) === '1',
          mvpIcon: m.mvpIcon || '',
          evalText: val(info['评价']) ?? '—',
          evalIcon: (info['评价'] && info['评价'].bi) || '',
          kills: val(info['淘汰']) ?? '—',
          assists: val(info['助攻']) ?? '—',
          damage: val(info['伤害']) ?? '—',
          rescue: val(info['救援']) ?? '—',
        }
      })
      // 本人数据（用于 result-bar 补充 淘汰/助攻/伤害/救援）
      const selfStat = team.find((m) => m.name === (camp.roleName || camp.nickName)) || team[0] || null

      // 我的淘汰：kills.data.list，含武器伤害明细 damageStats.list
      const killsList = (d.dataList || []).find((x) => x.type === 'kills')?.data?.list || []
      const kills = killsList.slice(0, 6).map((k) => {
        const statList = (k.damageStats && k.damageStats.list) || []
        const statWeapons = statList.slice(0, 3).map((sw) => {
          const parts = []
          for (const code in sw.partDamages || {}) parts.push(sw.partDamages[code])
          const partTotal = parts.reduce((s, n) => s + Number(n || 0), 0)
          return {
            name: sw.itemName || '',
            icon: sw.itemIcon || '',
            damage: sw.healthDamage ?? '—',
            distance: sw.hitDistance ?? '—',
            vest: sw.vestDamage ?? 0,
            partTotal,
          }
        })
        return {
          name: k.roleName || '未知玩家',
          avatar: k.roleIcon || '',
          desc: k.killDesc || '',
          div: k.divName || '',
          statWeapons,
        }
      })

      // 淘汰我的人
      const killerList = (d.dataList || []).find((x) => x.type === 'killer')?.data?.list || []
      const killer = killerList.slice(0, 3).map((k) => ({
        name: k.roleName || '未知玩家',
        avatar: k.roleIcon || '',
        desc: k.killDesc || '',
        div: k.divName || '',
      }))

      // 第一名队伍：top5.data.list = [每队{list:[成员]}...]，取第一名（下标0）
      const top5List = (d.dataList || []).find((x) => x.type === 'top5')?.data?.list || []
      const top1 = top5List[0]?.list || []
      const top1Players = top1.slice(0, 4).map((m) => {
        const info = {}
        for (const group of m.infoList || []) {
          for (const it of group) info[it.k] = it.v
        }
        return {
          name: m.roleName || '',
          avatar: m.roleIcon || '',
          survivalTime: m.survivalTime || '',
          isMvp: String(m.ismvp) === '1',
          mvpIcon: m.mvpIcon || '',
          evalIcon: (info['评价'] && info['评价'].bi) || '',
          evalText: val(info['评价']) ?? '—',
          kills: val(info['淘汰']) ?? '—',
          assists: val(info['助攻']) ?? '—',
          damage: val(info['伤害']) ?? '—',
        }
      })

      // 晋级赛标识：promotion = {taskId, process, target, protect, pass, rank, divName}
      const promo = d.promotion || null
      const promoPass = promo ? String(promo.pass) === '1' : false
      const promoText = promo
        ? promoPass
          ? '晋级赛成功'
          : promo.protect
            ? '晋级赛保护'
            : '晋级赛中'
        : ''
      const promoRank = promo && promo.rank ? promo.rank : ''
      const promoProc = promo && promo.process != null ? promo.process : ''
      const promoTarget = promo && promo.target != null ? promo.target : ''

      const image = await puppeteer.screenshot('battledetail', {
        tplFile: 'plugins/PUBG-Helper-Plugin/resources/battledetail.html',
        roleName: camp.roleName || camp.nickName || battleCache.roleId,
        mapMode: d.mapMode || '',
        modeIcon: d.modeIcon || '',
        divName: d.divName || '',
        playTime: d.playTime || '',
        promoText,
        promoRank,
        promoProc,
        promoTarget,
        rank: val(d.rank) ?? '—',
        playerNum: val(d.playerNum) ?? '—',
        peakCombat: d.peakCombat ?? '—',
        survivalTime: d.survivalTime || '',
        survivalProc: d.survivalProc ?? '—',
        gradeIcon: d.ratingIcon || d.rankIcon || '',
        isMvp: Number(d.isMvp) === 1,
        selfKills: selfStat ? selfStat.kills : '—',
        selfAssists: selfStat ? selfStat.assists : '—',
        selfDamage: selfStat ? selfStat.damage : '—',
        selfRescue: selfStat ? selfStat.rescue : '—',
        fights,
        weapons,
        team,
        kills,
        killTotal: killsList.length,
        killer,
        top1Players,
        updateTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        sys: { scale: `style=transform:scale(1.4)` },
      })
      e.reply(image)
    } catch (err) {
      e.reply('❌ 战绩详情查询失败：' + (err.message || err))
    }
  }
}
