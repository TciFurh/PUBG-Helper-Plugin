import fetch from 'node-fetch'
import querystring from 'node:querystring'

class ApiService {
    constructor() {
        this.baseUrl = 'https://formal.api.gp.qq.com/game/rolecard3'
        this.paramUrl = 'https://ghfast.top/https://raw.githubusercontent.com/A-Kevin1217/resources/master/resources/json/PUBG-Helper-Plugin/parameters.json'
    }

    async getMyHomepage(friendUserId) {
        // 获取参数
        const paramRes = await fetch(this.paramUrl)
        const p = await paramRes.json()

        // 构造请求参数
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

        const res = await fetch(this.baseUrl, {
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