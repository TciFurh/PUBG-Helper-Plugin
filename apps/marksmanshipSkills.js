import { ApiService } from '../utils/api.js'
import { getUserInfo } from '../utils/storage.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

const apiService = new ApiService()

export class MarksmanshipSkills extends plugin {
    constructor() {
        super({
            name: '[PHP]枪械熟练度',
            dsc: '和平精英枪械熟练度查询',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?枪械熟练度$/i,
                    fnc: 'marksmanshipSkills'
                },
                {
                    reg: /^#?枪械熟练度\s*(.+)$/i,
                    fnc: 'marksmanshipSkillsByType'
                },
                /* {
                    reg: /^和平签到$/i,
                    fnc: 'signIn'
                } */
            ]
        })
    }
/* 
    async signIn(e) {
        const data = await apiService.get_act_dailysigninmonthly()
        await e.reply(JSON.stringify(data))
    }
 */
    async marksmanshipSkills(e) {
        const weaponType = null
        await this.processWeaponData(e, weaponType)
    }

    async marksmanshipSkillsByType(e) {
        const weaponType = e.msg.match(/^#?枪械熟练度\s*(.+)$/i)?.[1]?.trim()
        if (!weaponType) {
            await e.reply('请输入正确的枪械类型，例如：\n#枪械熟练度 突击步枪\n#枪械熟练度 栓动狙击\n#枪械熟练度 轻机枪')
            return
        }
        await this.processWeaponData(e, weaponType)
    }

    async processWeaponData(e, weaponType) {
        let ID = (e.msg.match(/^#?和平(精英|英精)?主页(\d+)?$/i)?.[2]) || ''
        const { info } = getUserInfo(e.user_id)
        if (!ID) {
            ID = info.ids?.[info.current] || ''
        }
        apiService.useCamp(info.camp || null)
        if (!/^\d+$/.test(ID)) {
            await e.reply('请输入正确的用户ID（纯数字），或使用 #绑定和平+ID 先绑定')
            return
        }
        const data = await apiService.get_getweaponinfos2(ID)
        //logger.mark(JSON.stringify(data, null, 4))
        if (data.returnCode === -30003 && data.returnMsg === '登录态失效，请重新登录') {
            return e.reply('公共查询Token已失效')
        }
        const firearmsList = data.data.list

        let list = []
        for (let i = 0; i < firearmsList.length; i++) {
            // 如果指定了武器类型，进行过滤
            if (weaponType && !firearmsList[i].Type.includes(weaponType)) {
                continue
            }

            const levelUpExp = firearmsList[i].LevelUpExp || 0
            const weaponExp = firearmsList[i].WeaponExp || 0
            const expRatio = levelUpExp > 0 ? Math.max(0, Math.min(weaponExp / levelUpExp, 1)) : 0
            const circumference = 125.6
            const progressOffset = Number((circumference * (1 - expRatio)).toFixed(1))
            list.push({
                ResID: firearmsList[i].ResID,
                Type: firearmsList[i].Type,
                Name: firearmsList[i].Name,
                TotalOwnTime: isNaN(firearmsList[i].TotalOwnTime / 60 / 60) ? 0 : (firearmsList[i].TotalOwnTime / 60 / 60).toFixed(1),
                WeaponLv: firearmsList[i].WeaponLv || 0,
                WeaponExp: firearmsList[i].WeaponExp || 0,
                LevelUpExp: firearmsList[i].LevelUpExp || 0,
                progressOffset,
                TotalUseTimes: firearmsList[i].TotalUseTimes || 0,
                KillCount: firearmsList[i].KillCount || 0,
                MaxDamage: firearmsList[i].MaxDamage || 0,
                MaxKill: firearmsList[i].MaxKill || 0,
                HeadCount: firearmsList[i].HeadCount || 0,
                KillPerGame: (firearmsList[i].KillPerGame || 0).toFixed(2),
                DamagePerGame: (firearmsList[i].DamagePerGame || 0).toFixed(0),
                HeadPerGame: (firearmsList[i].HeadPerGame || 0).toFixed(2),
                HitRate: (firearmsList[i].HitRate || 0).toFixed(1),
                HeadRate: (firearmsList[i].HeadRate || 0).toFixed(1)
            })
        }

        if (list.length === 0 && weaponType) {
            await e.reply(`未找到类型为"${weaponType}"的枪械数据`)
            return
        }

        list.sort((a, b) => {
            if (b.WeaponLv !== a.WeaponLv) {
                return b.WeaponLv - a.WeaponLv
            }
            return b.WeaponExp - a.WeaponExp
        })

        const image = await puppeteer.screenshot('marksmanshipSkills', {
            tplFile: 'plugins/PUBG-Helper-Plugin/resources/marksmanshipSkills.html',
            sys: {
                scale: `style=transform:scale(2)`
            },
            list
        })

        e.reply(image)
    }
}