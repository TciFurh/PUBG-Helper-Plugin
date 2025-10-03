import fetch from 'node-fetch'
import querystring from 'node:querystring'

class ApiService {
    constructor() {
        this.main = 'https://formal.api.gp.qq.com'
        this.baseUrl = {
            rolecard3: '/game/rolecard3',
            gethonorinfo: '/play/gethonorinfo',
            getweaponinfos2: '/play/getweaponinfos2',
            getrecentbattlelist: '/play/getrecentbattlelist'
        }
        this.paramUrl = 'https://ghfast.top/https://raw.githubusercontent.com/A-Kevin1217/resources/master/resources/json/PUBG-Helper-Plugin/parameters.json'
    }

    async get_param() {
        try {
            const res = await fetch(this.paramUrl)
            if (!res.ok) {
                throw new Error('参数获取失败')
            }
            const data = await res.json()
            return data
        } catch (err) {
            console.error('获取参数失败:', err)
            return null
        }
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
            friendUserId: String(friendUserId).replace(/[^\x00-\x7F]/g, ''),
            roleId: '0',
            token: p.token,
            seasonId: p.seasonId,
            count: '5',
            gameId: '20004',
            cGameId: '20004',
            cCurrentGameId: '20004'
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.rolecard3, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6000) AppleWebKit/537.36'
            },
            body: postData
        })
        return res.json()
    }

    async get_gethonorinfo(friendUserId) {
        const p = await this.get_param()
        if (!p) {
            throw new Error('获取参数失败，无法请求rolecard3')
        }

        const params = {
            openId: p.openId,
            gameOpenId: p.gameOpenId,
            userId: p.userId,
            friendUserId: String(friendUserId).replace(/[^\x00-\x7F]/g, ''),
            roleId: '0',
            token: p.token,
            seasonId: p.seasonId,
            count: '5',
            gameId: '20004',
            cGameId: '20004',
            cCurrentGameId: '20004'
        }

        const postData = querystring.stringify(params)

        const res = await fetch(this.main + this.baseUrl.gethonorinfo, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6000) AppleWebKit/537.36'
            },
            body: postData
        })
        return res.json()
    }
}

export { ApiService }