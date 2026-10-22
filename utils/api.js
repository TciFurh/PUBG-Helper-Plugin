import fetch from 'node-fetch'
import querystring from 'node:querystring'

// seasonId 本地写死，不依赖远端参数文件，也不随 camp 变动
const LOCAL_SEASON_ID = '0'

class ApiService {
    constructor() {
        this.main = 'https://formal.api.gp.qq.com'
        this.baseUrl = {
            rolecard3: '/game/rolecard3',
            gethonorinfo: '/play/gethonorinfo',
            getweaponinfos2: '/play/getweaponinfos2',
            getresultbytypev2: '/search/getresultbytypev2',
            getcertusernews: '/game/getcertusernews',
            getmaintabs: '/game/getmaintabs',
            getdepotdetail: '/game/getdepotdetail',
            getweeklyreport: '/game/getweeklyreport',
            getrecentbattlelist: '/play/getrecentbattlelist',
            getpubgbattlelist: '/play/getpubgbattlelist',
            getbattlefilters: '/play/getbattlefilters',
            getescaperecord: '/play/getescaperecord',
            getlosttombrecord: '/play/getlosttombrecord',
            act_dailysigninmonthly: 'https://c.gp.qq.com/gp/api/php/act_dailysigninmonthly.php',
            getpubgplaydetail: 'https://c.gp.qq.com/gp/api/php/getpubgplaydetail.php',
            // 福利中心 / 每日任务
            act_getscoretasklist: 'https://c.gp.qq.com/gp/api/php/act_getscoretasklist.php',
            completescoretask: 'https://c.gp.qq.com/gp/api/php/completescoretask.php',
            act_receivelivenessgift: 'https://c.gp.qq.com/gp/api/php/act_receivelivenessgift.php',
            welfare_tasklist: 'https://c.gp.qq.com/gp/api/php/activity/welfare/tasklist.php',
            welfare_refreshtask: 'https://c.gp.qq.com/gp/api/php/activity/welfare/refreshtask.php',
            welfare_completetask: 'https://c.gp.qq.com/gp/api/php/activity/welfare/completetask.php',
            getpubgreplaydata4: 'https://c.gp.qq.com/h5/getpubgreplaydata4.php',
            infomainpage: '/game/infomainpage',
            addlike: '/user/addlike',
            likerecords: '/user/likerecords',
            squaretagmoments: '/moment/squaretagmoments',
            momentlike: '/moment/like',
            batchmodulelogreport: '/game/batchmodulelogreport',
            gametoolchange: '/play/gametoolchange',
            sharecallback: '/user/sharecallback',
            getrechargerank: '/game/getrechargerank',
            recharge: '/game/recharge',
            getstationhome: '/game/getstationhome',
            getseasonpasstask: '/game/getseasonpasstask',
            claimseasonpasspoints: '/game/claimseasonpasspoints',
            getusercoins: '/user/getusercoins',
            getvisits: '/user/getvisits',
            getonlinefriends: '/user/getonlinefriends',
            leaguelist: '/leagues/leaguelist',
            //getrecentbattlelist: '/play/getrecentbattlelist'
        }
        this.paramUrl = 'https://ghfast.top/https://raw.githubusercontent.com/A-Kevin1217/resources/master/resources/json/PUBG-Helper-Plugin/parameters.json'
        this.params = {
            roleId: '0',
            count: '5',
            gameId: '20004',
            cGameId: '20004',
            cCurrentGameId: '20004'
        }
        this.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6000) AppleWebKit/537.36'
        }
    }

    async get_param() {
        // 优先使用本地登录凭证(抓包提交), 没有则回落远端公共参数
        if (this.camp && this.camp.openId && this.camp.token) {
            return {
                openId: this.camp.openId,
                gameOpenId: this.camp.gameOpenId || this.camp.openId,
                userId: this.camp.userId,
                token: this.camp.token,
                seasonId: LOCAL_SEASON_ID
            }
        }
        try {
            const res = await fetch(this.paramUrl)
            if (!res.ok) {
                throw new Error('参数获取失败')
            }
            const data = await res.json()
            // seasonId 本地写死：不采用远端参数文件中的赛季号
            data.seasonId = LOCAL_SEASON_ID
            return data
        } catch (err) {
            console.error('获取参数失败:', err)
            return null
        }
    }

    useCamp(camp) {
        this.camp = camp || null
    }

    async get_rolecard3(friendUserId) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求rolecard3')
        }

        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendUserId: String(friendUserId).replace(/[^\x00-\x7F]/g, ''),
            ...this.params
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.rolecard3, {
            method: 'POST',
            headers: this.headers,
            body: postData
        })
        return res.json()
    }

    async get_gethonorinfo(friendUserId) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求gethonorinfo')
        }

        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendUserId: String(friendUserId).replace(/[^\x00-\x7F]/g, ''),
            ...this.params
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.gethonorinfo, {
            method: 'POST',
            headers: this.headers,
            body: postData
        })
        return res.json()
    }

    async get_getweaponinfos2(friendUserId) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求getweaponinfos2')
        }

        this.params.count = '0'

        let RoleID = await this.get_getresultbytypev2(friendUserId)
        this.params.roleId = RoleID.data.user.list[0].roleId
        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendUserId: String(friendUserId).replace(/[^\x00-\x7F]/g, ''),
            ...this.params
        }

        const postData = querystring.stringify(params)


        const res = await fetch(this.main + this.baseUrl.getweaponinfos2, {
            method: 'POST',
            headers: {
                ...this.headers
            },
            body: postData
        })
        return res.json()
    }

    async get_getresultbytypev2(friendUserId) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求getresultbytypev2')
        }

        const params = {
            keyword: friendUserId,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            type: 'comprehensive',
            page: '1',
            ...this.params
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.getresultbytypev2, {
            method: 'POST',
            headers: {
                ...this.headers
            },
            body: postData
        })
        return res.json()
    }

    async get_getcertusernews(friendUserId, page = 1) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求getcertusernews')
        }

        const safeFriendUserId = String(friendUserId).replace(/[^\x00-\x7F]/g, '')

        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            friendUserId: safeFriendUserId,
            feedsInfoType: '0',
            ext_params: JSON.stringify({ pageId: '105001', ext1: safeFriendUserId }),
            page: String(page),
            ...this.params
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.getcertusernews, {
            method: 'POST',
            headers: this.headers,
            body: postData
        })
        return res.json()
    }
    /* 
        async get_act_dailysigninmonthly() {
            const p = await this.get_param()
            if (!p) {
                throw new Error('获取参数失败，无法请求act_dailysigninmonthly')
            }
    
            const params = {
                openId: p.openId,
                gameOpenId: p.gameOpenId,
                userId: p.userId,
                token: p.token,
                seasonId: p.seasonId,
                ...this.params
            }
    
            const postData = querystring.stringify(params)
    
            const res = await fetch(this.baseUrl.act_dailysigninmonthly, {
                method: 'POST',
                headers: {
                    ...this.headers
                },
                body: postData
            })
            return res.json()
        }
         */

    /** 搜索自己拿角色ID（扫码账号的营地角色） */
    async get_self_role_id() {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法搜索自己')
        const params = {
            keyword: p.userId,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            type: 'comprehensive',
            page: '1',
            ...this.params,
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getresultbytypev2, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        const json = await res.json()
        const list = json.data?.user?.list || []
        return list[0]?.roleId ? String(list[0].roleId) : null
    }

    /** 资产：仓库分类（返回 时装/枪械/装备/载具/战备 及各自数量） */
    async get_maintabs(friendRoleId) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getmaintabs')
        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendRoleId: String(friendRoleId),
            ...this.params,
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getmaintabs, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 资产：仓库详情（mainTabId 来自 getmaintabs） */
    async get_depotdetail(friendRoleId, mainTabId) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getdepotdetail')
        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendRoleId: String(friendRoleId),
            mainTabId: String(mainTabId),
            ...this.params,
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getdepotdetail, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 签到：每日签到（返回 returnCode 0=成功 / -71003=今天已签 / -71005=失败） */
    async get_act_dailysigninmonthly(roleId) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求act_dailysigninmonthly')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.baseUrl.act_dailysigninmonthly, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 周报：本周对局数据（场次/胜场/前10/淘汰/KD/段位分变化） */
    async get_weeklyreport() {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getweeklyreport')
        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            friendUserId: String(p.userId),
            ...this.params,
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getweeklyreport, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 战绩分类筛选配置（tabIndex：0计分/1不计分/2团竞） */
    async get_battlefilters() {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getbattlefilters')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(p.roleId || this.params.roleId || '0'),
            gameId: '20004',
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getbattlefilters, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 全部战绩列表（分页+分类：tabIndex 0计分/1不计分/2团竞，mode/filter 可选筛选） */
    async get_pubgbattlelist(roleId, { page = 1, pageSize = 10, tabIndex = 0, mode = '', filter = 0 } = {}) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getpubgbattlelist')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
            page: String(page),
            pageSize: String(pageSize),
            tabIndex: String(tabIndex),
            gameId: '20004',
        }
        if (mode) params.mode = String(mode)
        params.filter = String(filter)
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getpubgbattlelist, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 最近对局列表（全模式，roleId 为游戏角色ID） */
    async get_recentbattlelist(roleId, count) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getrecentbattlelist')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
            count: String(count || 10),
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getrecentbattlelist, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 地铁逃生赛季档案（不传 escapeSeasonId 返回当前赛季） */
    async get_escaperecord(roleId, escapeSeasonId = '') {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getescaperecord')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
        }
        if (escapeSeasonId) params.escapeSeasonId = String(escapeSeasonId)
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getescaperecord, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 古墓迷途赛季档案（不传 losttombSeasonId 返回当前赛季） */
    async get_losttombrecord(roleId, losttombSeasonId = '') {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getlosttombrecord')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
        }
        if (losttombSeasonId) params.losttombSeasonId = String(losttombSeasonId)
        const postData = querystring.stringify(params)
        const res = await fetch(this.main + this.baseUrl.getlosttombrecord, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /** 单局战绩详情（battleId/battleMode 来自最近对局列表，roleId 为本人角色ID） */
    async get_pubgplaydetail(battleId, battleMode, roleId) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求getpubgplaydetail')
        const params = {
            ...this.params,
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            roleId: String(roleId),
            battleId: String(battleId),
            battleMode: String(battleMode),
        }
        const postData = querystring.stringify(params)
        const res = await fetch(this.baseUrl.getpubgplaydetail, {
            method: 'POST',
            headers: this.headers,
            body: postData,
        })
        return res.json()
    }

    /* ================= 福利中心 / 每日任务 =================
     * 接口来源：营地 APP 抓包 + 反编译交叉验证（GameHelperAction 同款）。
     * 积分任务（签到页那份，完成即自动入账）走 c.gp.qq.com 的 H5 php；
     * 福利任务（每天 3 条，可刷新）领奖走 welfare/completetask.php；
     * 行为动作（点赞/分享/充能/工具）全部走 formal.api.gp.qq.com。
     * 实测（2026-10-23）：插件现有 openId/userId/token 凭证即可通，
     * 教程里的 sig/msdkEncodeParam/timestamp 并非必需。
     */

    /** 通用表单 POST（营地接口都是这一套） */
    async _postForm(url, params) {
        const p = await this.get_param()
        if (!p) throw new Error('获取参数失败，无法请求营地接口')
        const postData = querystring.stringify({
            openId: p.openId,
            gameOpenId: p.gameOpenId || p.openId,
            userId: p.userId,
            token: p.token,
            seasonId: p.seasonId,
            ...this.params,
            ...params,
        })
        const res = await fetch(url, { method: 'POST', headers: this.headers, body: postData })
        return res.json()
    }

    /** H5 侧公共参数（source/version 固定为营地客户端值，roleId 由调用方传入） */
    _h5Base(roleId) {
        return {
            algorithm: 'v2',
            encode: '2',
            source: 'heping_yingdi',
            version: '3.1.96i',
            roleId: String(roleId || this.params.roleId || '0'),
        }
    }

    /** 积分任务列表（签到页那份，10 条，含活跃度礼包） */
    async get_score_tasklist(roleId) {
        return this._postForm(this.baseUrl.act_getscoretasklist, this._h5Base(roleId))
    }

    /** 上报完成积分任务（实测多数任务完成即自动入账，此口用于 status=1 的兜底） */
    async complete_score_task(taskId, roleId) {
        return this._postForm(this.baseUrl.completescoretask, { ...this._h5Base(roleId), taskId: String(taskId) })
    }

    /** 领活跃度礼包（giftId 1=福利币*100 2=营地装饰碎片*50 3=福利币*200） */
    async receive_liveness_gift(giftId, roleId) {
        return this._postForm(this.baseUrl.act_receivelivenessgift, { ...this._h5Base(roleId), giftId: String(giftId) })
    }

    /** 福利任务列表（每天 3 条，refreshCount=剩余刷新次数） */
    async get_welfare_tasklist(roleId) {
        return this._postForm(this.baseUrl.welfare_tasklist, this._h5Base(roleId))
    }

    /** 刷新福利任务（把做不了的任务换掉，次数有限） */
    async refresh_welfare_task(roleId) {
        return this._postForm(this.baseUrl.welfare_refreshtask, this._h5Base(roleId))
    }

    /** 领取福利任务奖励（taskIndex 来自 tasklist 的 index 字段） */
    async complete_welfare_task(taskIndex, roleId) {
        return this._postForm(this.baseUrl.welfare_completetask, { ...this._h5Base(roleId), taskIndex: String(taskIndex) })
    }

    /** 资讯流（浏览/点赞任务从这取 iInfoId） */
    async get_info_main_page() {
        return this._postForm(this.main + this.baseUrl.infomainpage, { type: '51005184', pos1: '2', sort: '2', page: '1' })
    }

    /** 资讯点赞 / 取消点赞（like: 1=赞 0=取消） */
    async add_info_like(iInfoId, like = '1') {
        return this._postForm(this.main + this.baseUrl.addlike, { iInfoId: String(iInfoId), like: String(like) })
    }

    /** 我的点赞记录（做完任务后取消点赞用，避免留下社交痕迹） */
    async get_like_records() {
        return this._postForm(this.main + this.baseUrl.likerecords, {})
    }

    /** 动态广场（动态点赞任务从这取 momentId） */
    async get_square_moments() {
        return this._postForm(this.main + this.baseUrl.squaretagmoments, { tagId: '1' })
    }

    /** 动态点赞 / 取消（type: 1=赞 0=取消） */
    async add_moment_like(momentId, type = '1') {
        return this._postForm(this.main + this.baseUrl.momentlike, { momentId: String(momentId), type: String(type) })
    }

    /** 行为埋点上报（浏览资讯5分钟 / 看直播5分钟任务靠这个模拟） */
    async batch_module_report(extData) {
        return this._postForm(this.main + this.baseUrl.batchmodulelogreport, { extData: JSON.stringify(extData) })
    }

    /** 开关对局工具（任务要求「启用 N 个工具」） */
    async change_game_tool(id, status = '1') {
        return this._postForm(this.main + this.baseUrl.gametoolchange, { id: String(id), status: String(status) })
    }

    /** 分享回调（分享类任务的服务端记数口，客户端真实分享服务端收不到） */
    async share_callback(action, id = '') {
        return this._postForm(this.main + this.baseUrl.sharecallback, { action: String(action), id: String(id) })
    }

    /** 充能排行榜（充能任务从这取可充能的资讯） */
    async get_recharge_rank() {
        return this._postForm(this.main + this.baseUrl.getrechargerank, {})
    }

    /** 给资讯充能 */
    async recharge_info(iInfoId, cnt = '1') {
        return this._postForm(this.main + this.baseUrl.recharge, { iInfoId: String(iInfoId), rechargeCnt: String(cnt) })
    }

    /** 攻略专区首页（浏览攻略任务） */
    async get_station_home() {
        return this._postForm(this.main + this.baseUrl.getstationhome, {})
    }

    /** 战绩复盘数据（观看复盘任务） */
    async get_replay_data() {
        return this._postForm(this.baseUrl.getpubgreplaydata4, {})
    }

    /** 游戏手册（赛季手册）每周任务列表（8 周，status 0未完成/1完成待领/2已领；roleId 必传，传 0 会回 -20011） */
    async get_season_pass_task(roleId) {
        return this._postForm(this.main + this.baseUrl.getseasonpasstask, { roleId: String(roleId || '') })
    }

    /** 领取手册积分（默认不调用：#和平周任务 只做不领） */
    async claim_season_pass_points(roleId) {
        return this._postForm(this.main + this.baseUrl.claimseasonpasspoints, { roleId: String(roleId || '') })
    }

    /* ================= 营地社交 / 资料（读操作） ================= */

    /** 营地币余额（coins: [{type,num,name}]，福利币/营地装饰碎片…） */
    async get_user_coins() {
        return this._postForm(this.main + this.baseUrl.getusercoins, {})
    }

    /** 访客记录（昵称/角色/段位/最近访问时间） */
    async get_visits() {
        return this._postForm(this.main + this.baseUrl.getvisits, {})
    }

    /** 在线好友（需 roleId） */
    async get_online_friends(roleId) {
        return this._postForm(this.main + this.baseUrl.getonlinefriends, { roleId: String(roleId || '') })
    }

    /** 赛事列表（PEL/PSI 等官方联赛） */
    async get_league_list() {
        return this._postForm(this.main + this.baseUrl.leaguelist, {})
    }
}

export { ApiService }