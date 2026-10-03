import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from './errors.mjs';

export const VERSION = '1.0.0';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_BASE_URL = 'https://open.feishu.cn/open-apis';

/** 极简 .env 解析：已存在的 process.env 优先，不覆盖。 */
export function loadDotEnv(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

/** 依次尝试 cwd/.env 与包根目录/.env，让 CLI 在任何目录下都能跑。 */
export function loadEnv(extraDirs = []) {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(PKG_ROOT, '.env'),
    ...extraDirs.map((d) => path.join(d, '.env')),
  ];
  const loaded = [];
  for (const file of candidates) {
    if (loadDotEnv(file)) loaded.push(file);
  }
  return loaded;
}

/**
 * 读取凭证。overrides 用于 CLI 的 --app-id/--app-secret。
 * 不在这里 loadEnv，避免副作用；由入口显式调用。
 */
export function getConfig(overrides = {}) {
  const appId = overrides.appId || process.env.FEISHU_APP_ID || '';
  const appSecret = overrides.appSecret || process.env.FEISHU_APP_SECRET || '';
  const baseUrl = (
    overrides.baseUrl ||
    process.env.FEISHU_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '');

  if (!appId || !appSecret) {
    const missing = [
      !appId && 'FEISHU_APP_ID',
      !appSecret && 'FEISHU_APP_SECRET',
    ]
      .filter(Boolean)
      .join(', ');
    throw new ConfigError(
      `缺少飞书应用凭证：${missing}`,
      `设置环境变量，或在 ${PKG_ROOT} 下创建 .env（参考 .env.example）`,
    );
  }
  return { appId, appSecret, baseUrl };
}

export { PKG_ROOT };
