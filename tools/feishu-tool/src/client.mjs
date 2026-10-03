import { FeishuError, hintFor } from './errors.mjs';
import { DEFAULT_BASE_URL } from './config.mjs';

/** 提前 60 秒过期，避免边界上用到刚过期的 token。 */
const TOKEN_SKEW_MS = 60_000;
const MIN_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

/** appId -> { token, expiresAt }，进程内复用。 */
const tokenCache = new Map();

/**
 * 惰性客户端：只有真正访问方法时才构造 FeishuClient。
 *
 * 这样纯本地能力（如 bitable.parse_url）在没有凭证时也能跑，
 * 而需要凭证的能力仍会在第一次调用时抛出清晰的配置错误。
 */
export function lazyClient(factory, opts) {
  let real = null;
  const resolve = () => {
    if (!real) {
      let config;
      try {
        config = factory();
      } catch (e) {
        // dry-run 不会用到凭证，缺凭证不该拦住「只打印请求」
        if (!opts?.dryRun) throw e;
        config = { appId: '(dry-run)', appSecret: '(dry-run)', baseUrl: DEFAULT_BASE_URL };
      }
      real = new FeishuClient(config, opts);
    }
    return real;
  };
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const value = resolve()[prop];
        return typeof value === 'function' ? value.bind(real) : value;
      },
      has(_target, prop) {
        return prop in resolve();
      },
      getPrototypeOf() {
        return FeishuClient.prototype;
      },
    },
  );
}

export class FeishuClient {
  constructor(config, { dryRun = false } = {}) {
    this.config = config;
    this.dryRun = dryRun;
  }

  /** 取 tenant_access_token，命中缓存则不请求。force=true 强制刷新。 */
  async getToken(force = false) {
    const key = this.config.appId;
    const cached = tokenCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.token;

    const url = `${this.config.baseUrl}/auth/v3/tenant_access_token/internal`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new FeishuError({
        code: 'NETWORK',
        msg: `请求飞书鉴权接口失败：${e.message}`,
        method: 'POST',
        path: '/auth/v3/tenant_access_token/internal',
        hint: '检查网络/代理是否可达 open.feishu.cn',
      });
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* 非 JSON 响应，下面统一报错 */
    }

    if (!json || json.code !== 0 || !json.tenant_access_token) {
      throw new FeishuError({
        code: json?.code ?? res.status,
        msg: json?.msg ?? `获取 tenant_access_token 失败（HTTP ${res.status}）`,
        method: 'POST',
        path: '/auth/v3/tenant_access_token/internal',
        http: res.status,
        hint: hintFor(json?.code, json?.msg),
      });
    }

    const ttl = Math.max((json.expire ?? 7200) * 1000 - TOKEN_SKEW_MS, MIN_TTL_MS);
    tokenCache.set(key, {
      token: json.tenant_access_token,
      expiresAt: Date.now() + ttl,
    });
    return json.tenant_access_token;
  }

  /** 清掉缓存的 token（测试用）。 */
  static clearTokenCache() {
    tokenCache.clear();
  }

  buildUrl(apiPath, query) {
    const url = new URL(this.config.baseUrl + apiPath);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url;
  }

  async request(method, apiPath, { query, body, _retriedAuth = false } = {}) {
    const url = this.buildUrl(apiPath, query);

    if (this.dryRun) {
      return {
        __dryRun: true,
        method,
        url: url.toString(),
        body: body ?? null,
      };
    }

    const token = await this.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const init = { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      init.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new FeishuError({
        code: 'NETWORK',
        msg: `请求失败：${e.message}`,
        method,
        path: url.pathname,
        hint: '检查网络/代理是否可达飞书开放平台',
      });
    }

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 保留原始文本用于报错 */
    }

    // token 失效：刷新后重试一次
    if (json?.code === 99991663 && !_retriedAuth) {
      await this.getToken(true);
      return this.request(method, apiPath, { query, body, _retriedAuth: true });
    }

    if (!json || json.code !== 0) {
      throw new FeishuError({
        code: json?.code ?? res.status,
        msg: json?.msg ?? `非 JSON 响应（HTTP ${res.status}）：${text.slice(0, 200)}`,
        logId: json?.error?.log_id,
        method,
        path: url.pathname,
        http: res.status,
        raw: text.slice(0, 1000),
        hint: hintFor(json?.code ?? res.status, json?.msg ?? text),
      });
    }

    return json.data ?? {};
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }
  post(path, opts) {
    return this.request('POST', path, opts);
  }
  put(path, opts) {
    return this.request('PUT', path, opts);
  }
  del(path, opts) {
    return this.request('DELETE', path, opts);
  }
}
