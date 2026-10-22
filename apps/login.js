import { getCamp, saveCamp, deleteCamp, maskToken, getUserInfo } from '../utils/storage.js'

export class Login extends plugin {
	constructor() {
		super({
			name: '[PHP]登录凭证',
			dsc: '和平营地登录凭证(抓包)提交/查看/删除',
			event: 'message',
			priority: 1,
			rule: [
				{ reg: '^#?和平(精英|英精)?登录(帮助|教程)?$', fnc: 'loginGuide' },
				{ reg: '^#提交和平\\s*(.*)$', fnc: 'submitCred' },
				{ reg: '^#和平凭证$', fnc: 'viewCred' },
				{ reg: '^#删除和平凭证$', fnc: 'removeCred' }
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
			'提交后即可用个人凭证查询(失效自动回落公共查询)'
		].join('\n')
		await e.reply(guide)
	}

	// 提交凭证
	async submitCred(e) {
		const raw = String(e.msg.replace(/^#提交和平\s*/, '')).trim()
		const parts = raw.split(/[:：\s]+/).filter(Boolean)
		if (parts.length < 4) {
			return e.reply('格式错误。示例：\n#提交和平 openId:gameOpenId:userId:token[:seasonId]')
		}
		const [openId, gameOpenId, userId, token, seasonId] = parts
		if (!openId || !gameOpenId || !userId || !token) {
			return e.reply('openId/gameOpenId/userId/token 均不能为空')
		}
		saveCamp(e.user_id, { openId, gameOpenId, userId, token, seasonId: seasonId || '0' })
		const camp = getCamp(e.user_id)
		return e.reply([
			'✅ 凭证已保存\n',
			`营地ID: ${camp.userId}\n`,
			`token: ${maskToken(camp.token)}\n`,
			`seasonId: ${camp.seasonId}\n`,
			'现在可以使用个人凭证查询了。'
		])
	}

	// 查看凭证
	async viewCred(e) {
		const camp = getCamp(e.user_id)
		if (!camp) return e.reply('尚未提交凭证。可用 #和平登录 查看抓包教程')
		return e.reply([
			'【当前营地凭证】\n',
			`营地ID: ${camp.userId}\n`,
			`openId: ${camp.openId}\n`,
			`gameOpenId: ${camp.gameOpenId}\n`,
			`token: ${maskToken(camp.token)}\n`,
			`seasonId: ${camp.seasonId}\n`,
			`更新于: ${new Date(camp.updatedAt).toLocaleString('zh-CN')}`
		])
	}

	// 删除凭证
	async removeCred(e) {
		const camp = getCamp(e.user_id)
		if (!camp) return e.reply('你还没有凭证可删除')
		deleteCamp(e.user_id)
		return e.reply('已删除登录凭证，查询将回落公共数据')
	}
}
