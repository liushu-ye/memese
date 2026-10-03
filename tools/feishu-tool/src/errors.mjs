/**
 * 飞书 API 错误。
 *
 * 飞书的错误信息对排查很关键（尤其是 99991672 权限缺失、91403 文档权限缺失），
 * 所以这里把原始返回尽量完整地保留下来。
 */
export class FeishuError extends Error {
  constructor({ code, msg, logId, method, path, http, raw, hint }) {
    super(hint ? `${msg}（${hint}）` : msg || '未知飞书错误');
    this.name = 'FeishuError';
    this.code = code;
    this.msg = msg;
    this.logId = logId;
    this.method = method;
    this.path = path;
    this.http = http;
    this.raw = raw;
    this.hint = hint;
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      msg: this.msg,
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.method ? { request: `${this.method} ${this.path}` } : {}),
      ...(this.http ? { http: this.http } : {}),
      ...(this.logId ? { log_id: this.logId } : {}),
    };
  }
}

export class ConfigError extends Error {
  constructor(message, hint) {
    super(hint ? `${message}（${hint}）` : message);
    this.name = 'ConfigError';
    this.hint = hint;
  }

  toJSON() {
    return { error: true, code: 'CONFIG', msg: this.message };
  }
}

/** 把飞书错误码翻译成人话，减少每次翻文档的成本。 */
export function hintFor(code, msg = '') {
  const table = {
    99991672: '应用缺少所需权限。去开发者后台「权限管理」勾选对应权限的【应用身份】列，并创建版本发布。',
    99991663: 'access token 无效或已过期，会自动刷新重试一次。仍失败请检查 App ID/Secret。',
    99991668: 'token 与应用不匹配，检查是否用了别的应用的凭证。',
    91403: 'Forbidden：应用对该云文档没有编辑权限。在多维表格右上角「⋯ → ⋯更多 → 添加文档应用」，或把链接分享改为「组织内获得链接的人可编辑」。',
    91402: 'NOTEXIST：该 token 对应的资源不存在，或应用无权访问（飞书对无权限资源也返回此码）。检查 app_token 是否正确、应用是否已加为协作者。',
    40404: '未找到该用户/群，检查 ID 是否正确、应用是否在通讯录权限范围内。',
    230002: '机器人不在该群内。先把机器人拉进群。',
  };
  if (table[code]) return table[code];
  if (String(code) === '131005') return '知识库节点不存在，或该 token 不是知识库节点。';
  if (String(msg).includes('page not found')) return '接口路径不存在，多半是 API 版本写错或资源类型不对。';
  return undefined;
}
