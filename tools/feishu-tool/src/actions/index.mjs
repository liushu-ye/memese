import { imActions } from './im.mjs';
import { contactActions } from './contact.mjs';
import { bitableActions } from './bitable.mjs';

export const actions = [...imActions, ...contactActions, ...bitableActions];

const byName = new Map(actions.map((a) => [a.name, a]));
const byMcpName = new Map(actions.map((a) => [mcpName(a), a]));

/** MCP 工具名只允许 [A-Za-z0-9_-]，所以点号换成下划线。 */
export function mcpName(action) {
  return action.name.replace(/\./g, '_');
}

export function groups() {
  return [...new Set(actions.map((a) => a.group))];
}

/** 支持精确名、base→bitable 别名、以及唯一后缀匹配（如 records.list）。 */
export function findAction(name) {
  if (!name) return undefined;
  const key = String(name).trim();
  if (byName.has(key)) return byName.get(key);
  if (byMcpName.has(key)) return byMcpName.get(key);

  const alias = key.replace(/^base\./, 'bitable.');
  if (byName.has(alias)) return byName.get(alias);

  const lower = key.toLowerCase();
  const exactCi = actions.find((a) => a.name.toLowerCase() === lower);
  if (exactCi) return exactCi;

  const suffixHits = actions.filter(
    (a) => a.name.toLowerCase().endsWith(`.${lower}`) || a.name.toLowerCase() === lower,
  );
  if (suffixHits.length === 1) return suffixHits[0];
  if (suffixHits.length > 1) {
    throw new Error(
      `「${key}」匹配到多个能力：${suffixHits.map((a) => a.name).join(', ')}。请写全名。`,
    );
  }
  return undefined;
}

/** 按声明类型做一次转换，CLI 拿到的是字符串。 */
export function coerceValue(value, spec) {
  if (value === undefined || value === null || value === '') return value;
  switch (spec.type) {
    case 'integer':
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`参数需要数字，收到「${value}」`);
      return n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1' || value === 'yes';
    }
    case 'array': {
      if (Array.isArray(value)) return value;
      const s = String(value).trim();
      if (s.startsWith('[')) return JSON.parse(s);
      return s === '' ? [] : s.split(',').map((x) => x.trim()).filter(Boolean);
    }
    case 'object': {
      if (typeof value === 'object') return value;
      return JSON.parse(String(value));
    }
    default:
      return String(value);
  }
}

/** 校参 + 转换 + 填默认值。write 类动作必填项缺失直接报错，不打到接口上。 */
export function normalizeArgs(action, raw = {}) {
  const spec = action.params ?? {};
  const out = {};
  const unknown = [];

  for (const [k, v] of Object.entries(raw)) {
    if (!(k in spec)) {
      unknown.push(k);
      continue;
    }
    const v2 = coerceValue(v, spec[k]);
    if (v2 !== undefined && v2 !== null && v2 !== '') out[k] = v2;
  }

  const missing = [];
  for (const [k, s] of Object.entries(spec)) {
    if (out[k] === undefined) {
      if (s.default !== undefined) out[k] = s.default;
      else if (s.required) missing.push(k);
    }
  }

  if (missing.length) {
    throw new Error(
      `缺少必填参数：${missing.join(', ')}。用 \`feishu help ${action.name}\` 查看用法。`,
    );
  }
  return { args: out, unknown };
}

/** 转成 MCP 的 JSON Schema。 */
export function inputSchema(action) {
  const properties = {};
  const required = [];
  for (const [k, s] of Object.entries(action.params ?? {})) {
    let p;
    switch (s.type) {
      case 'integer':
        p = { type: 'integer' };
        break;
      case 'number':
        p = { type: 'number' };
        break;
      case 'boolean':
        p = { type: 'boolean' };
        break;
      case 'array':
        p = { type: 'array', items: {} };
        break;
      case 'object':
        p = { type: 'object', additionalProperties: true };
        break;
      default:
        p = { type: 'string' };
    }
    if (s.enum) p.enum = s.enum;
    if (s.desc) p.description = s.desc;
    if (s.default !== undefined) p.default = s.default;
    properties[k] = p;
    if (s.required) required.push(k);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export function listTools() {
  return actions.map((a) => ({
    name: mcpName(a),
    description: `[${a.group}] ${a.summary}${a.description ? ` — ${a.description}` : ''}`,
    inputSchema: inputSchema(a),
  }));
}
