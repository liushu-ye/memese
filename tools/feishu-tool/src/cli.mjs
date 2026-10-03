import fs from 'node:fs';
import {
  actions,
  findAction,
  normalizeArgs,
  groups,
} from './actions/index.mjs';
import { lazyClient } from './client.mjs';
import { getConfig, loadEnv, VERSION } from './config.mjs';
import { FeishuError, ConfigError } from './errors.mjs';

/** CLI 自己的开关，与能力参数（下划线命名）区分开。 */
const GLOBAL_FLAGS = new Set([
  'json',
  'compact',
  'dry-run',
  'verbose',
  'app-id',
  'app-secret',
  'base-url',
  'group',
  'help',
  'h',
]);

function parseArgv(argv) {
  const params = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith('--')) {
      let name = tok.slice(2);
      let value;
      const eq = name.indexOf('=');
      if (eq >= 0) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) value = true;
        else {
          value = next;
          i++;
        }
      }
      params[name] = value;
    } else if (/^-[a-z]$/i.test(tok)) {
      params[tok.slice(1).toLowerCase()] = true;
    } else {
      positional.push(tok);
    }
  }
  return { params, positional };
}

function splitGlobals(params) {
  const globals = {};
  const rest = {};
  for (const [k, v] of Object.entries(params)) {
    if (GLOBAL_FLAGS.has(k)) globals[k] = v;
    else rest[k] = v;
  }
  return { globals, rest };
}

/**
 * 支持 `--参数 @file.json` 与 `--参数 @-`（读 stdin）。
 * 复杂 JSON 在 shell 里转义很容易出错，落成文件最稳。
 */
function expandAtFiles(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.startsWith('@') && v.length > 1) {
      const target = v.slice(1);
      try {
        out[k] = target === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(target, 'utf8');
      } catch (e) {
        throw new Error(`读取 ${target} 失败：${e.message}`);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * 把整张多维表格导出成扁平 JSON —— 给「数据当资源文件用」的场景。
 *
 * 刻意只做 CLI、不注册进 MCP：导出可能几百上千行，灌进模型上下文没有意义。
 */
async function runExport(globals, rest, compact) {
  loadEnv();
  const client = lazyClient(
    () =>
      getConfig({
        appId: typeof globals['app-id'] === 'string' ? globals['app-id'] : undefined,
        appSecret:
          typeof globals['app-secret'] === 'string' ? globals['app-secret'] : undefined,
        baseUrl: typeof globals['base-url'] === 'string' ? globals['base-url'] : undefined,
      }),
    { dryRun: Boolean(globals['dry-run']) },
  );

  let appToken = typeof rest.app_token === 'string' ? rest.app_token : undefined;
  let tableId = typeof rest.table_id === 'string' ? rest.table_id : undefined;
  if (rest.url) {
    const parsed = await findAction('bitable.parse_url').handler(null, {
      url: String(rest.url),
    });
    appToken = appToken || parsed.app_token;
    tableId = tableId || parsed.table_id;
    if (!appToken) {
      throw new Error(`无法从链接解析出 app_token：${(parsed.warnings || []).join('；')}`);
    }
  }
  if (!appToken) throw new Error('需要 --app_token 与 --table_id，或用 --url 传完整表格链接');
  if (!tableId) throw new Error('缺少 --table_id（链接里通常带 ?table=tblXXXX）');

  const list = findAction('bitable.records.list');
  const records = [];
  let pageToken;
  let pages = 0;
  do {
    const page = await list.handler(client, {
      app_token: appToken,
      table_id: tableId,
      page_size: 500,
      page_token: pageToken,
    });
    for (const item of page.items ?? []) {
      records.push({ record_id: item.record_id, ...(item.fields ?? {}) });
    }
    pages++;
    pageToken = page.has_more ? page.page_token : undefined;
  } while (pageToken);

  if (rest['sort-by']) {
    const key = String(rest['sort-by']);
    records.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      const nx = Number(x);
      const ny = Number(y);
      if (x !== null && y !== null && x !== '' && !Number.isNaN(nx) && !Number.isNaN(ny)) {
        return nx - ny;
      }
      return String(x ?? '').localeCompare(String(y ?? ''), 'zh');
    });
  }

  const outFile = rest.out || rest.o;
  process.stderr.write(
    `已导出 ${records.length} 条记录（${pages} 页） app_token=${appToken} table_id=${tableId}\n`,
  );

  if (outFile) {
    fs.writeFileSync(String(outFile), JSON.stringify(records, null, 2) + '\n', 'utf8');
    process.stderr.write(`写入 ${outFile}\n`);
    return;
  }
  process.stdout.write(
    (compact ? JSON.stringify(records) : JSON.stringify(records, null, 2)) + '\n',
  );
}

/**
 * 启动只读代理：把多维表格包成普通 HTTP JSON 接口给 App 用。
 *
 * 支持两种配置方式：
 *   --config serve.json          （多表，推荐）
 *   --app_token X --table_id Y   （单表，快速试）
 */
async function runServe(globals, rest) {
  loadEnv();
  const { startProxy } = await import('./server.mjs');
  const { getConfig: cfg } = await import('./config.mjs');

  const feishuConfig = cfg({
    appId: typeof globals['app-id'] === 'string' ? globals['app-id'] : undefined,
    appSecret:
      typeof globals['app-secret'] === 'string' ? globals['app-secret'] : undefined,
    baseUrl: typeof globals['base-url'] === 'string' ? globals['base-url'] : undefined,
  });

  let tables;
  let token = typeof rest.token === 'string' ? rest.token : null;

  if (rest.config) {
    const raw = JSON.parse(fs.readFileSync(String(rest.config), 'utf8'));
    tables = raw.tables ?? [];
    if (!tables.length) throw new Error(`${rest.config} 里没有 tables 配置`);
    if (raw.token) token = raw.token;
  } else if (rest.app_token && rest.table_id) {
    tables = [{
      path: rest.path ?? '/memes',
      app_token: rest.app_token,
      table_id: rest.table_id,
      ttlSeconds: rest.ttl ? Number(rest.ttl) : undefined,
      sortBy: rest['sort-by'],
    }];
  } else {
    throw new Error('需要 --config <配置文件>，或同时给 --app_token 与 --table_id');
  }

  const port = Number(rest.port ?? process.env.PORT ?? 8787);
  const host = String(rest.host ?? '0.0.0.0');

  const { tables: routes } = await startProxy({
    feishuConfig,
    tables,
    token,
    port,
    host,
    onLog: (m) => process.stderr.write(`[serve] ${m}\n`),
  });

  process.stderr.write(
    `\n飞书表格代理已启动  http://${host}:${port}\n` +
      routes.map((t) => `  GET ${t.path.padEnd(20)} ttl=${t.ttlSeconds}s\n`).join('') +
      `  GET /health\n` +
      (token ? `已启用 token 校验\n` : `未设 token（任何人可读）\n`) +
      `\n按 Ctrl+C 停止。\n`,
  );

  // 常驻，不退出
  await new Promise(() => {});
}

function printUsage() {
  const lines = [
    `feishu-tool v${VERSION} — 飞书开放平台 CLI`,
    '',
    '用法:',
    '  feishu list [--group <组>]        列出所有能力',
    '  feishu help <能力>                查看某个能力的参数',
    '  feishu <能力> [--参数 值 ...]      调用能力',
    '  feishu export --url <表格链接> --out <文件>   导出整张表为扁平 JSON',
    '  feishu serve --config serve.json             启动只读代理给 App 用',
    '',
    '全局开关:',
    '  --compact        输出单行 JSON（适合管道）',
    '  --dry-run        只打印将要发出的请求，不实际调用',
    '  --app-id / --app-secret / --base-url   覆盖环境变量凭证',
    '',
    '参数技巧:',
    '  --fields @payload.json   从文件读取 JSON（复杂对象/数组推荐）',
    '  --records @-             从标准输入读取 JSON',
    '',
    `能力分组: ${groups().join(', ')}`,
    `共 ${actions.length} 个能力。`,
    '',
    '示例:',
    '  feishu bitable.parse_url --url "https://xxx.feishu.cn/base/XXXX?table=tblYYY"',
    '  feishu bitable.records.list --app_token XXXX --table_id tblYYY',
    '  feishu im.send --receive_id ou_xxx --text "你好"',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

function printList(group) {
  const list = group ? actions.filter((a) => a.group === group) : actions;
  if (!list.length) {
    process.stderr.write(`没有分组为「${group}」的能力。可选: ${groups().join(', ')}\n`);
    process.exitCode = 1;
    return;
  }
  let current = null;
  for (const a of list) {
    if (a.group !== current) {
      current = a.group;
      process.stdout.write(`\n${current}\n`);
    }
    process.stdout.write(`  ${a.name.padEnd(30)} ${a.summary}\n`);
  }
  process.stdout.write('\n');
}

function printHelp(name) {
  const action = findAction(name);
  if (!action) {
    process.stderr.write(`未找到能力「${name}」。用 \`feishu list\` 查看全部。\n`);
    process.exitCode = 1;
    return;
  }
  const lines = [
    `${action.name}  —  ${action.summary}`,
    action.description ? `\n${action.description}` : '',
    `\n分组: ${action.group}${action.mutates ? '   [写操作]' : ''}`,
    '\n参数:',
  ];
  const entries = Object.entries(action.params ?? {});
  if (!entries.length) lines.push('  （无）');
  for (const [k, s] of entries) {
    const req = s.required ? '必填' : s.default !== undefined ? `默认 ${s.default}` : '可选';
    const type = s.enum ? s.enum.join('|') : s.type;
    lines.push(`  --${k.padEnd(20)} ${String(type).padEnd(22)} ${req}`);
    if (s.desc) lines.push(`  ${' '.repeat(24)}${s.desc}`);
  }
  const example = [`feishu ${action.name}`];
  for (const [k, s] of entries) {
    if (s.required) {
      const t = s.type === 'integer' ? '1' : s.type === 'object' ? '{}' : s.type === 'array' ? '[]' : '<值>';
      example.push(`--${k} ${t}`);
    }
  }
  lines.push('\n示例:', `  ${example.join(' ')}`);
  process.stdout.write(lines.join('\n') + '\n');
}

export async function run(argv) {
  const { params, positional } = parseArgv(argv);
  const { globals, rest } = splitGlobals(params);

  const command = positional[0];
  const compact = Boolean(globals.compact || globals.json);

  if (!command || command === 'help' || command === '--help' || globals.help || globals.h) {
    if (command && command !== 'help') return printHelp(command);
    if (positional[1]) return printHelp(positional[1]);
    return printUsage();
  }
  if (command === 'list' || command === 'ls') {
    return printList(globals.group);
  }
  if (command === 'export') {
    return runExport(globals, rest, compact);
  }
  if (command === 'serve') {
    return runServe(globals, rest);
  }
  if (command === 'version' || command === '-v') {
    return process.stdout.write(`${VERSION}\n`);
  }

  const action = findAction(command);
  if (!action) {
    process.stderr.write(
      `未找到能力「${command}」。用 \`feishu list\` 查看全部，或 \`feishu help <能力>\`。\n`,
    );
    process.exitCode = 1;
    return;
  }

  const { args, unknown } = normalizeArgs(action, expandAtFiles(rest));
  if (unknown.length) {
    process.stderr.write(
      `警告: 忽略未知参数 ${unknown.map((u) => '--' + u).join(', ')}\n`,
    );
  }

  const dryRun = Boolean(globals['dry-run']);
  loadEnv();
  const client = lazyClient(
    () =>
      getConfig({
        appId: typeof globals['app-id'] === 'string' ? globals['app-id'] : undefined,
        appSecret:
          typeof globals['app-secret'] === 'string' ? globals['app-secret'] : undefined,
        baseUrl: typeof globals['base-url'] === 'string' ? globals['base-url'] : undefined,
      }),
    { dryRun },
  );

  const data = await action.handler(client, args);

  process.stdout.write(
    (compact ? JSON.stringify(data) : JSON.stringify(data, null, 2)) + '\n',
  );
}

export async function main(argv = process.argv.slice(2)) {
  try {
    await run(argv);
  } catch (err) {
    if (err instanceof FeishuError || err instanceof ConfigError) {
      process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + '\n');
    } else {
      process.stderr.write(
        JSON.stringify({ error: true, code: 'LOCAL', msg: err.message }, null, 2) + '\n',
      );
    }
    process.exitCode = 1;
  }
}
