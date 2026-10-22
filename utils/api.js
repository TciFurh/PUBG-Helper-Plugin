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
            act_dailysigninmonthly: 'https://c.gp.qq.com/gp/api/php/act_dailysigninmonthly.php',
            getpubgplaydetail: 'https://c.gp.qq.com/gp/api/php/getpubgplaydetail.php',
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
}

export { ApiService }