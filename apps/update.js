import { update as Update } from '../../other/update.js'

export class GloryOfKingsUpdate extends plugin {
  constructor () {
    super({
      name: '王者插件_更新',
      dsc: '调用Yunzai自带更新模块进行插件更新',
      event: 'message',
      priority: 2000,
      rule: [
        {
          reg: '^#*和平(插件)?(强制)?更新$',
          fnc: 'update',
          permission: 'master'
        },
        {
          reg: '^#*和平(插件)?更新(日志|记录)$',
          fnc: 'update_log',
          permission: 'master'
        }
      ]
    })
  }

  async update (e) {
    if (e.at && !e.atme) return
    e.msg = `#${e.msg.includes('强制') ? '强制' : ''}更新PUBG-Helper-Plugin`
    const up = new Update(e)
    up.e = e
    return up.update()
  }

  async update_log () {
    let UpdatePlugin = new Update()
    UpdatePlugin.e = this.e
    UpdatePlugin.reply = this.reply

    if (UpdatePlugin.getPlugin("PUBG-Helper-Plugin")) {
      this.e.reply(await UpdatePlugin.getLog("PUBG-Helper-Plugin"))
    }
    return true
  }
}
