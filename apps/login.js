import { getCamp, saveCamp, deleteCamp, maskToken, getUserInfo, listCamps, formatIdList } from '../utils/storage.js'
import { saveCampAndBind } from '../utils/accounts.js'
import Button from '../utils/button.js'


export class Login extends plugin {
	constructor() {
		super({
			name: '[PHP]登录凭证',
			dsc: '和平营地登录凭证(抓包)提交/查看/删除',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: '^#?和平(精英|英精)?登录(帮助|教程)?$', fnc: 'loginGuide' },
				{ reg: '^#?提交和平\\s*(.*)$', fnc: 'submitCred' },
				{ reg: '^#?和平凭证$', fnc: 'viewCred' },
				{ reg: '^#?删除和平凭证$', fnc: 'removeCred' }
			]
		})
	}

	// 抓包引导
	async loginGuide(e) {
		const guide = [
			'【和平营地 登录凭证】',
			'',
			'原理：营地APP查询接口需要登录态(openId/gameOpenId/userId/token)。',
			'抓包获取方式：',
			'1. 手机安装抓包工具(HTTPCanary/Stream 等)',
			'2. 打开营地APP并保持已登录',
			'3. 在抓包记录中找到请求:',
			'   POST https://formal.api.gp.qq.com/game/rolecard3',
			'4. 复制请求表单中的以下参数:',
			'   openId、gameOpenId、userId、token(可选 seasonId)',
			'',
			'提交格式：',
			' #提交和平 openId:gameOpenId:userId:token',
			' #提交和平 openId:gameOpenId:userId:token:seasonId',
			'',
			'查看: #和平凭证    删除: #删除和平凭证',
			'支持多账号：不同账号各提交/扫码一次即可，各自的角色ID会自动绑定',
			'提交后即可用个人凭证查询(失效自动回落公共查询)'
		].join('\n')
		await e.reply([guide, Button.bind()])
	}

	// 提交凭证
	async submitCred(e) {
		const raw = String(e.msg.replace(/^#?提交和平\s*/, '')).trim()
		const parts = raw.split(/[:：\s]+/).filter(Boolean)
		if (parts.length < 4) {
			return e.reply('格式错误。示例：\n#提交和平 openId:gameOpenId:userId:token[:seasonId]')
		}
		const [openId, gameOpenId, userId, token, seasonId] = parts
		if (!openId || !gameOpenId || !userId || !token) {
			return e.reply('openId/gameOpenId/userId/token 均不能为空')
		}
		const r = await saveCampAndBind(e.user_id, { openId, gameOpenId, userId, token, seasonId: seasonId || '0', platform: 'cookie' })
		const info = getUserInfo(e.user_id).info
		const idList = info.ids.length ? '角色列表:\n' + (await formatIdList(info)) : ''
		const lines = [
			'✅ 凭证已保存' + (r.isNew ? '' : '（已更新同账号旧凭证）'),
			`营地账号: ${r.camp.userId}`,
			r.roleId ? `已绑定营地ID: ${r.camp?.userId || ''}（角色ID: ${r.roleId}）` : `已绑定营地ID: ${r.camp?.userId || ''}（角色ID未解析，可 #绑定和平 <营地ID>`,
			`当前账号数: ${r.total}（#和平账号 查看）`,
			idList,
			'现在可以使用个人凭证查询了。'
		].filter(Boolean)
		return e.reply(lines.join('\n'))
	}

	// 查看凭证
	async viewCred(e) {
		const camp = getCamp(e.user_id)
		if (!camp) return e.reply('尚未提交凭证。可用 #和平登录 查看抓包教程')
		const camps = listCamps(e.user_id)
		const idx = camps.findIndex((c) => c.openId === camp.openId && c.userId === camp.userId)
		return e.reply([
			`【当前营地凭证】（${idx + 1}/${camps.length}）`,
			`营地账号: ${camp.userId}`,
			`昵称: ${camp.nickname || camp.userName || '-'}`,
			`平台: ${camp.platform || '-'}`,
			`角色ID: ${camp.roleId || '未解析'}`,
			`openId: ${camp.openId}`,
			`gameOpenId: ${camp.gameOpenId}`,
			`token: ${maskToken(camp.token)}`,
			`seasonId: ${camp.seasonId}`,
			`更新于: ${new Date(camp.updatedAt).toLocaleString('zh-CN')}`,
			'',
			'多账号用 #和平账号 查看 / #切换和平账号 切换'
		].join('\n'))
	}

	// 删除凭证
	async removeCred(e) {
		const camp = getCamp(e.user_id)
		if (!camp) return e.reply('你还没有凭证可删除')
		deleteCamp(e.user_id)
		const left = listCamps(e.user_id).length
		return e.reply(left ? `已删除当前营地账号，剩余 ${left} 个（#和平账号 查看）` : '已删除登录凭证，查询将回落公共数据')
	}
}
