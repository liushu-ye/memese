/**
 * 零依赖只读代理：把飞书多维表格包成普通 HTTP JSON 接口。
 *
 * 存在的唯一理由：App 不能持有 App Secret，但又要消费表格数据。
 * 密钥留在这里（服务端环境变量），App 只认 URL。
 *
 * 设计要点：
 * - TTL 内存缓存：飞书接口有频控，必须挡在前面
 * - stale-on-error：上游挂了就发旧数据，App 不该因为飞书抽风而白屏
 * - ETag / 304：App 每次启动只做一次轻量协商，没变化不重传
 * - 每个表一条路由，可配多个
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { FeishuClient } from './client.mjs';
import { findAction } from './actions/index.mjs';

const DEFAULT_TTL_SECONDS = 300;

export function normalizeTable(t, index = 0) {
  const appToken = t.app_token ?? t.appToken;
  const tableId = t.table_id ?? t.tableId;
  if (!appToken || !tableId) {
    throw new Error(`第 ${index + 1} 个表配置缺少 app_token 或 table_id`);
  }
  let path = t.path ?? `/${t.name ?? 'table' + (index + 1)}`;
  if (!path.startsWith('/')) path = '/' + path;
  return {
    path,
    appToken,
    tableId,
    ttlSeconds: Number(t.ttlSeconds ?? t.ttl ?? DEFAULT_TTL_SECONDS),
    sortBy: t.sortBy ?? t.sort_by,
    stripRecordId: Boolean(t.stripRecordId ?? t.strip_record_id),
  };
}

/** 翻页取全表，拍平成数组。 */
export async function fetchTable(client, table) {
  const list = findAction('bitable.records.list');
  const records = [];
  let pageToken;
  do {
    const page = await list.handler(client, {
      app_token: table.appToken,
      table_id: table.tableId,
      page_size: 500,
      page_token: pageToken,
    });
    for (const item of page.items ?? []) {
      const row = { record_id: item.record_id, ...(item.fields ?? {}) };
      if (table.stripRecordId) delete row.record_id;
      records.push(row);
    }
    pageToken = page.has_more ? page.page_token : undefined;
  } while (pageToken);

  if (table.sortBy) {
    records.sort((a, b) => {
      const key = table.sortBy;
      const nx = Number(a[key]);
      const ny = Number(b[key]);
      if (
        a[key] !== null && a[key] !== undefined && a[key] !== '' &&
        !Number.isNaN(nx) && !Number.isNaN(ny)
      ) {
        return nx - ny;
      }
      return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'zh');
    });
  }
  return records;
}

export function createProxyServer({ feishuConfig, tables, token = null, onLog = () => {} }) {
  const client = new FeishuClient(feishuConfig);
  const normalized = tables.map(normalizeTable);
  const cache = new Map(); // path -> { at, payload, etag, records }
  const inflight = new Map(); // path -> Promise，防止并发穿透

  async function load(table, { force = false } = {}) {
    const hit = cache.get(table.path);
    const fresh = hit && Date.now() - hit.at < table.ttlSeconds * 1000;
    if (hit && fresh && !force) return { ...hit, state: 'HIT' };
    if (inflight.has(table.path)) return inflight.get(table.path);

    const task = (async () => {
      try {
        const records = await fetchTable(client, table);
        const payload = JSON.stringify(records);
        const entry = {
          at: Date.now(),
          records,
          payload,
          etag: '"' + crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16) + '"',
          state: 'MISS',
        };
        cache.set(table.path, entry);
        onLog(`${table.path} 刷新成功，${records.length} 条`);
        return entry;
      } catch (err) {
        if (hit) {
          onLog(`${table.path} 刷新失败，改用旧数据：${err.message}`);
          return { ...hit, state: 'STALE' };
        }
        throw err;
      } finally {
        inflight.delete(table.path);
      }
    })();

    inflight.set(table.path, task);
    return task;
  }

  function authorized(req, url) {
    if (!token) return true;
    const header = req.headers.authorization ?? '';
    if (header === `Bearer ${token}`) return true;
    return url.searchParams.get('token') === token;
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, If-None-Match',
      'Access-Control-Expose-Headers': 'ETag, X-Cache, X-Record-Count, X-Cache-Age',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    };
    res.writeHead(status, headers);
    res.end(body);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, If-None-Match',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, JSON.stringify({ error: '只支持 GET' }));
      return;
    }

    if (url.pathname === '/health') {
      sendJson(res, 200, JSON.stringify({
        ok: true,
        tables: normalized.map((t) => ({
          path: t.path,
          cached: cache.has(t.path),
          ageSeconds: cache.has(t.path) ? Math.round((Date.now() - cache.get(t.path).at) / 1000) : null,
          ttlSeconds: t.ttlSeconds,
        })),
      }));
      return;
    }

    const table = normalized.find((t) => t.path === url.pathname);
    if (!table) {
      sendJson(res, 404, JSON.stringify({
        error: 'not found',
        available: normalized.map((t) => t.path),
      }));
      return;
    }

    if (!authorized(req, url)) {
      sendJson(res, 401, JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const force = url.searchParams.get('refresh') === '1';

    try {
      const entry = await load(table, { force });
      const headers = {
        ETag: entry.etag,
        'X-Cache': entry.state,
        'X-Record-Count': String(entry.records.length),
        'X-Cache-Age': String(Math.round((Date.now() - entry.at) / 1000)),
      };

      // 条件请求：App 只想知道「有没有变」
      if (req.headers['if-none-match'] === entry.etag && !force) {
        res.writeHead(304, headers);
        res.end();
        return;
      }

      sendJson(res, 200, entry.payload, headers);
    } catch (err) {
      onLog(`${table.path} 加载失败：${err.message}`);
      sendJson(res, 502, JSON.stringify({
        error: 'upstream_failed',
        message: err.message,
        code: err.code,
        hint: err.hint,
      }));
    }
  });

  return { server, tables: normalized, cache, load };
}

export async function startProxy(opts) {
  const { server, tables } = createProxyServer(opts);
  const port = opts.port ?? 8787;
  const host = opts.host ?? '127.0.0.1';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return { server, tables, port: server.address().port, host };
}
