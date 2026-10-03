/**
 * 消息（im）能力。
 */

/** 把 text / content 两种写法归一成飞书需要的 content JSON 字符串。 */
function resolveContent(a, defaultType = 'text') {
  const msgType = a.msg_type || defaultType;
  if (a.content) return { msgType, content: a.content };
  if (msgType === 'text') {
    if (a.text === undefined) throw new Error('缺少 text（或 content）参数');
    return { msgType, content: JSON.stringify({ text: String(a.text) }) };
  }
  if (msgType === 'post') {
    if (!a.post) throw new Error('msg_type=post 需要 --post 传入 JSON');
    return { msgType, content: JSON.stringify(a.post) };
  }
  throw new Error(`msg_type=${msgType} 时必须用 --content 传入 JSON 字符串`);
}

/** open_id / chat_id 等在不同接口里的参数名不一致，统一在这里兜底。 */
const ID_TYPE = {
  type: 'string',
  enum: ['open_id', 'user_id', 'union_id', 'email', 'chat_id'],
  desc: 'ID 类型，默认 open_id（群通信用 chat_id）',
};

export const imActions = [
  {
    name: 'im.send',
    group: 'im',
    mutates: true,
    summary: '给用户或群发消息',
    description: '以机器人身份发送消息。群通信用 receive_id_type=chat_id。',
    params: {
      receive_id: { type: 'string', required: true, desc: '接收方 ID' },
      receive_id_type: { ...ID_TYPE, default: 'open_id' },
      text: { type: 'string', desc: '纯文本内容（最常用）' },
      msg_type: { type: 'string', default: 'text', desc: '消息类型，默认 text' },
      content: { type: 'string', desc: '消息内容 JSON 字符串（非 text 类型时使用）' },
    },
    handler: (c, a) => {
      const { msgType, content } = resolveContent(a);
      return c.post('/im/v1/messages', {
        query: { receive_id_type: a.receive_id_type || 'open_id' },
        body: { receive_id: a.receive_id, msg_type: msgType, content },
      });
    },
  },
  {
    name: 'im.reply',
    group: 'im',
    mutates: true,
    summary: '回复某条消息',
    description: '在会话内引用回复指定 message_id。',
    params: {
      message_id: { type: 'string', required: true, desc: '要回复的消息 ID（om_ 开头）' },
      text: { type: 'string', desc: '纯文本内容' },
      msg_type: { type: 'string', default: 'text' },
      content: { type: 'string', desc: '消息内容 JSON 字符串' },
      reply_in_thread: { type: 'boolean', desc: '是否以话题形式回复' },
    },
    handler: (c, a) => {
      const { msgType, content } = resolveContent(a);
      return c.post(`/im/v1/messages/${a.message_id}/reply`, {
        query: { reply_in_thread: a.reply_in_thread || undefined },
        body: { msg_type: msgType, content },
      });
    },
  },
  {
    name: 'im.message.get',
    group: 'im',
    summary: '获取单条消息详情',
    description: '按 message_id 查消息，可拿到 chat_id（用于反查会话）。',
    params: {
      message_id: { type: 'string', required: true, desc: '消息 ID（om_ 开头）' },
    },
    handler: (c, a) => c.get(`/im/v1/messages/${a.message_id}`),
  },
  {
    name: 'im.messages.list',
    group: 'im',
    summary: '拉取会话历史消息',
    description:
      '按会话拉取消息列表。机器人未配置事件订阅时，这是读取用户来信的唯一途径。',
    params: {
      container_id: { type: 'string', required: true, desc: '会话 ID（oc_ 开头）' },
      container_id_type: { type: 'string', default: 'chat', desc: '容器类型，固定 chat' },
      start_time: { type: 'string', desc: '起始时间，秒级时间戳' },
      end_time: { type: 'string', desc: '结束时间，秒级时间戳' },
      sort_type: { type: 'string', enum: ['ByCreateTimeAsc', 'ByCreateTimeDesc'], desc: '排序' },
      page_size: { type: 'integer', default: 20, desc: '每页条数，最大 50' },
      page_token: { type: 'string', desc: '分页标记' },
    },
    handler: (c, a) =>
      c.get('/im/v1/messages', {
        query: {
          container_id_type: a.container_id_type || 'chat',
          container_id: a.container_id,
          start_time: a.start_time,
          end_time: a.end_time,
          sort_type: a.sort_type,
          page_size: a.page_size ?? 20,
          page_token: a.page_token,
        },
      }),
  },
  {
    name: 'im.chats.list',
    group: 'im',
    summary: '列出机器人所在的群',
    description: '只返回机器人已加入的群。返回空说明机器人还没被拉进任何群。',
    params: {
      page_size: { type: 'integer', default: 20 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get('/im/v1/chats', {
        query: { page_size: a.page_size ?? 20, page_token: a.page_token },
      }),
  },
  {
    name: 'im.chat.get',
    group: 'im',
    summary: '获取群信息',
    params: {
      chat_id: { type: 'string', required: true, desc: '群 ID（oc_ 开头）' },
    },
    handler: (c, a) => c.get(`/im/v1/chats/${a.chat_id}`),
  },
  {
    name: 'im.chat.members',
    group: 'im',
    summary: '获取群成员列表',
    params: {
      chat_id: { type: 'string', required: true },
      member_id_type: {
        type: 'string',
        enum: ['open_id', 'union_id', 'user_id'],
        default: 'open_id',
      },
      page_size: { type: 'integer', default: 20 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get(`/im/v1/chats/${a.chat_id}/members`, {
        query: {
          member_id_type: a.member_id_type || 'open_id',
          page_size: a.page_size ?? 20,
          page_token: a.page_token,
        },
      }),
  },
];
