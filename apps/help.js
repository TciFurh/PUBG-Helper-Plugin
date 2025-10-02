export class Help extends plugin {
    constructor() {
        super({
            name:'[PHP]菜单',
            dsc: '和平精英插件菜单',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^#?和平(精英|英精)?(插件|plugin)?(帮助|help)$/i,
                    fnc: 'showHelp'
                }
            ]
        })
    }

    async showHelp(e) {
        await e.reply('这是一条帮助')
    }
}