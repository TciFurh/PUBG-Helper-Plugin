import fs from 'node:fs';

const file = [
  ...fs.readdirSync('./plugins/PUBG-Helper-Plugin/apps')
].filter(file => file.endsWith('.js'));

let ret = []

logger.info('和平精英插件载入中...')

file.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}

for (let i in file) {
  let name = file[i].replace('.js', '')

  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
export { apps }
logger.mark('和平精英插件载入成功')