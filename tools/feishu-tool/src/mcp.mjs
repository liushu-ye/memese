/**
 * 零依赖 MCP Server（stdio 传输）。
 *
 * 没有引入 @modelcontextprotocol/sdk，因为这台机器的 npm 被沙箱挡住；
 * 而且我们只需要 initialize / tools/list / tools/call 三个方法，
 * 手写 JSON-RPC 反而更少变数。stdout 只走协议，日志一律走 stderr。
 */
import readline from 'node:readline';
import {
  findAction,
  mcpName,
  normalizeArgs,
  listTools,
} from './actions/index.mjs';
import { lazyClient } from './client.mjs';
import { getConfig, loadEnv, VERSION } from './config.mjs';
import { FeishuError, ConfigError } from './errors.mjs';

const SERVER_NAME = 'feishu-tool';
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
const DEFAULT_PROTOCOL = '2025-06-18';

const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

function log(...args) {
  process.stderr.write(`[${SERVER_NAME}] ${args.join(' ')}\n`);
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message, data) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

/** 工具执行失败要作为 isError 结果返回，而不是 JSON-RPC 错误，客户端才能看到原因。 */
function toolError(id, err) {
  const payload =
    err instanceof FeishuError || err instanceof ConfigError
      ? err.toJSON()
      : { error: true, code: 'LOCAL', msg: err.message };
  ok(id, {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
  });
}

let cachedClient = null;
function client() {
  if (!cachedClient) {
    loadEnv();
    cachedClient = lazyClient(() => getConfig(), { dryRun: false });
  }
  return cachedClient;
}

export async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL;
      log(`initialize: client=${params?.clientInfo?.name ?? '?'} protocol=${protocolVersion}`);
      ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: VERSION },
      });
      return;
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'ping':
      ok(id, {});
      return;

    case 'tools/list':
      ok(id, { tools: listTools() });
      return;

    case 'tools/call': {
      const name = params?.name;
      const action = name ? findAction(name) : undefined;
      if (!action) {
        fail(id, RPC.INVALID_PARAMS, `未知工具：${name}`);
        return;
      }
      let normalized;
      try {
        normalized = normalizeArgs(action, params?.arguments ?? {});
      } catch (e) {
        toolError(id, e);
        return;
      }
      try {
        const data = await action.handler(client(), normalized.args);
        ok(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false,
        });
      } catch (e) {
        log(`tool ${name} failed: ${e.message}`);
        toolError(id, e);
      }
      return;
    }

    default:
      if (isNotification) return;
      fail(id, RPC.METHOD_NOT_FOUND, `不支持的方法：${method}`);
  }
}

export function startServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  let queue = Promise.resolve();

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      fail(null, RPC.PARSE_ERROR, 'JSON 解析失败');
      return;
    }
    // 串行处理，避免并发写 stdout 交织
    queue = queue.then(() => handle(msg)).catch((e) => {
      log('unhandled:', e?.stack ?? String(e));
      if (msg && msg.id !== undefined) fail(msg.id, RPC.INTERNAL_ERROR, String(e?.message ?? e));
    });
  });

  rl.on('close', () => {
    // 必须等队列排空：否则 stdin 关闭时仍在飞的 tools/call 响应会被丢掉
    queue.then(() => {
      log('stdin closed, exiting');
      process.exit(0);
    });
  });

  log(`v${VERSION} ready, ${listTools().length} tools, protocol <= ${DEFAULT_PROTOCOL}`);
}

export function dumpTools() {
  return JSON.stringify(
    { server: SERVER_NAME, version: VERSION, toolCount: listTools().length, tools: listTools() },
    null,
    2,
  );
}

export { mcpName };
