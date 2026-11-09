/**
 * 扫码登录这类长耗时流程的会话回推。
 *
 * 轮询动辄数分钟，等结果出来时 e.reply 依赖的消息上下文可能已经失效，
 * 所以这里用 Bot 主动发。bot 实例 id 必须取 e.self_id，不能写死：
 *   - 换号 / 多 bot 在线时，写死的 id 不对应触发会话的那个账号，会串号；
 *   - Bot.sendGroupMsg 遇到不在 Bot.uin 里的 id 不会立即失败，而是挂
 *     connect.<id> 监听等 5 分钟超时，此时回退的 e.reply 早已失效 → 通知丢失。
 * self_id 缺失或对应账号已下线时留空，交给框架按群 / 好友自动挑选 bot。
 *
 * 私聊必须用 sendFriendMsg：Bot 核心没有 sendPrivateMsg（仅 Milky 适配器有，
 * 且签名是 (data, msg)），写错会抛 TypeError 后静默回退。
 */
import { getBot } from 'jiuli'

export async function notifySession(e, msg) {
    const Bot = getBot()
    const selfId = e?.self_id
    const botId = selfId && Bot?.uin?.some?.((id) => String(id) === String(selfId))
        ? selfId
        : undefined
    try {
        if (e.group_id) {
            await Bot.sendGroupMsg(botId, e.group_id, msg)
        } else {
            await Bot.sendFriendMsg(botId, e.user_id, msg)
        }
        return true
    } catch (err) {
        try { await e.reply(msg) } catch { /* 会话已彻底失效 */ }
        return false
    }
}
