/**
 * 多维表格（bitable）能力。
 *
 * 关键经验：
 * - app_token 是链接里 /base/ 后面那串，不是 workspace ID
 * - 应用要能写，必须在表格里加为「文档应用」或把链接分享设为「组织内可编辑」，
 *   否则读得出、写报 91403
 */

const APP_TOKEN = {
  type: 'string',
  required: true,
  desc: '多维表格 app_token（链接 /base/ 后面那串）',
};
const TABLE_ID = {
  type: 'string',
  required: true,
  desc: '数据表 ID，形如 tblXXXXXX',
};

const tablePath = (a) => `/bitable/v1/apps/${a.app_token}/tables/${a.table_id}`;

/** field_names / sort 这类要传 JSON 数组字符串，统一序列化。 */
const jsonParam = (v) =>
  v === undefined || v === null || v === '' || typeof v === 'string'
    ? v
    : JSON.stringify(v);

export const bitableActions = [
  {
    name: 'bitable.parse_url',
    group: 'bitable',
    summary: '从飞书链接解析 app_token / table_id',
    description:
      '本地解析，不调接口。拿到链接后先用它拆参数，比手工截字符串可靠。',
    params: {
      url: { type: 'string', required: true, desc: '飞书多维表格链接' },
    },
    handler: (_c, a) => {
      const url = String(a.url).trim();
      const out = {
        input: url,
        app_token: null,
        table_id: null,
        view_id: null,
        warnings: [],
      };
      if (/\/base\/workspace\//i.test(url)) {
        out.warnings.push(
          '这是多维表格「工作区」链接，不是单张表的链接。请点进具体表格后再复制地址栏链接。',
        );
      }
      const base = url.match(/\/base\/([A-Za-z0-9]+)/);
      if (base && base[1].toLowerCase() !== 'workspace') out.app_token = base[1];
      const tbl = url.match(/[?&]table=(tbl[A-Za-z0-9]+)/);
      if (tbl) out.table_id = tbl[1];
      const vew = url.match(/[?&]view=(vew[A-Za-z0-9]+)/);
      if (vew) out.view_id = vew[1];
      if (!out.app_token) out.warnings.push('未能从链接中解析出 app_token。');
      if (!out.table_id) out.warnings.push('链接未包含 table_id，调用记录类接口时需另找。');
      return out;
    },
  },
  {
    name: 'bitable.app.create',
    group: 'bitable',
    mutates: true,
    summary: '新建多维表格',
    description: '需要 bitable:app 或 base:app:create 权限。folder_token 留空则建在应用自己的空间。',
    params: {
      name: { type: 'string', required: true, desc: '表格名称' },
      folder_token: { type: 'string', desc: '目标文件夹 token，可留空' },
    },
    handler: (c, a) =>
      c.post('/bitable/v1/apps', {
        body: { name: a.name, ...(a.folder_token ? { folder_token: a.folder_token } : {}) },
      }),
  },
  {
    name: 'bitable.app.get',
    group: 'bitable',
    summary: '获取多维表格元数据',
    params: { app_token: APP_TOKEN },
    handler: (c, a) => c.get(`/bitable/v1/apps/${a.app_token}`),
  },
  {
    name: 'bitable.tables.list',
    group: 'bitable',
    summary: '列出所有数据表',
    params: {
      app_token: APP_TOKEN,
      page_size: { type: 'integer', default: 50 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get(`/bitable/v1/apps/${a.app_token}/tables`, {
        query: { page_size: a.page_size ?? 50, page_token: a.page_token },
      }),
  },
  {
    name: 'bitable.tables.create',
    group: 'bitable',
    mutates: true,
    summary: '新建数据表',
    params: {
      app_token: APP_TOKEN,
      name: { type: 'string', required: true, desc: '数据表名称' },
      default_view_name: { type: 'string', desc: '默认视图名称' },
      fields: { type: 'array', desc: '初始字段数组（JSON）' },
    },
    handler: (c, a) =>
      c.post(`/bitable/v1/apps/${a.app_token}/tables`, {
        body: {
          table: {
            name: a.name,
            ...(a.default_view_name ? { default_view_name: a.default_view_name } : {}),
            ...(a.fields?.length ? { fields: a.fields } : {}),
          },
        },
      }),
  },
  {
    name: 'bitable.tables.delete',
    group: 'bitable',
    mutates: true,
    summary: '删除数据表',
    params: { app_token: APP_TOKEN, table_id: TABLE_ID },
    handler: (c, a) => c.del(tablePath(a)),
  },
  {
    name: 'bitable.views.list',
    group: 'bitable',
    summary: '列出数据表视图',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      page_size: { type: 'integer', default: 50 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get(`${tablePath(a)}/views`, {
        query: { page_size: a.page_size ?? 50, page_token: a.page_token },
      }),
  },
  {
    name: 'bitable.fields.list',
    group: 'bitable',
    summary: '列出字段（列）',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      page_size: { type: 'integer', default: 100 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get(`${tablePath(a)}/fields`, {
        query: { page_size: a.page_size ?? 100, page_token: a.page_token },
      }),
  },
  {
    name: 'bitable.fields.create',
    group: 'bitable',
    mutates: true,
    summary: '新增字段（列）',
    description: 'type 为飞书字段类型：1=文本 2=数字 3=单选 4=多选 5=日期 11=人员 15=超链接 17=附件。',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      field_name: { type: 'string', required: true },
      type: { type: 'integer', required: true, desc: '字段类型，如 1=文本' },
      property: { type: 'object', desc: '字段属性（JSON），如单选的 options' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/fields`, {
        body: {
          field_name: a.field_name,
          type: a.type,
          ...(a.property ? { property: a.property } : {}),
        },
      }),
  },
  {
    name: 'bitable.fields.update',
    group: 'bitable',
    mutates: true,
    summary: '更新字段（列）',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      field_id: { type: 'string', required: true, desc: '字段 ID，形如 fldXXXX' },
      field_name: { type: 'string', required: true },
      type: { type: 'integer', required: true },
      property: { type: 'object' },
    },
    handler: (c, a) =>
      c.put(`${tablePath(a)}/fields/${a.field_id}`, {
        body: {
          field_name: a.field_name,
          type: a.type,
          ...(a.property ? { property: a.property } : {}),
        },
      }),
  },
  {
    name: 'bitable.fields.delete',
    group: 'bitable',
    mutates: true,
    summary: '删除字段（列）',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      field_id: { type: 'string', required: true },
    },
    handler: (c, a) => c.del(`${tablePath(a)}/fields/${a.field_id}`),
  },
  {
    name: 'bitable.records.list',
    group: 'bitable',
    summary: '列出记录',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      page_size: { type: 'integer', default: 100, desc: '每页条数，最大 500' },
      page_token: { type: 'string' },
      view_id: { type: 'string', desc: '只在指定视图内查询' },
      filter: { type: 'string', desc: '过滤公式，如 CurrentValue.[中文]="你好"' },
      sort: { type: 'array', desc: '排序数组（JSON）' },
      field_names: { type: 'array', desc: '只返回指定字段名' },
      automatic_fields: { type: 'boolean', desc: '是否返回创建/修改人等系统字段' },
    },
    handler: (c, a) =>
      c.get(`${tablePath(a)}/records`, {
        query: {
          page_size: a.page_size ?? 100,
          page_token: a.page_token,
          view_id: a.view_id,
          filter: a.filter,
          sort: jsonParam(a.sort),
          field_names: jsonParam(a.field_names),
          automatic_fields: a.automatic_fields,
        },
      }),
  },
  {
    name: 'bitable.records.get',
    group: 'bitable',
    summary: '获取单条记录',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      record_id: { type: 'string', required: true, desc: '记录 ID，形如 recXXXX' },
    },
    handler: (c, a) => c.get(`${tablePath(a)}/records/${a.record_id}`),
  },
  {
    name: 'bitable.records.create',
    group: 'bitable',
    mutates: true,
    summary: '新增一条记录',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      fields: { type: 'object', required: true, desc: '字段值对象（JSON）' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/records`, { body: { fields: a.fields } }),
  },
  {
    name: 'bitable.records.update',
    group: 'bitable',
    mutates: true,
    summary: '更新一条记录',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      record_id: { type: 'string', required: true },
      fields: { type: 'object', required: true, desc: '要更新的字段（JSON，增量）' },
    },
    handler: (c, a) =>
      c.put(`${tablePath(a)}/records/${a.record_id}`, { body: { fields: a.fields } }),
  },
  {
    name: 'bitable.records.delete',
    group: 'bitable',
    mutates: true,
    summary: '删除一条记录',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      record_id: { type: 'string', required: true },
    },
    handler: (c, a) => c.del(`${tablePath(a)}/records/${a.record_id}`),
  },
  {
    name: 'bitable.records.batch_create',
    group: 'bitable',
    mutates: true,
    summary: '批量新增记录',
    description: '一次最多 500 条。records 为 [{fields:{...}}, ...]。',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      records: { type: 'array', required: true, desc: '记录数组（JSON）' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/records/batch_create`, { body: { records: a.records } }),
  },
  {
    name: 'bitable.records.batch_update',
    group: 'bitable',
    mutates: true,
    summary: '批量更新记录',
    description: 'records 为 [{record_id, fields:{...}}, ...]。',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      records: { type: 'array', required: true, desc: '记录数组（JSON）' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/records/batch_update`, { body: { records: a.records } }),
  },
  {
    name: 'bitable.records.batch_delete',
    group: 'bitable',
    mutates: true,
    summary: '批量删除记录',
    description: 'records 为 record_id 字符串数组。',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      records: { type: 'array', required: true, desc: 'record_id 数组（JSON）' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/records/batch_delete`, { body: { records: a.records } }),
  },
  {
    name: 'bitable.records.search',
    group: 'bitable',
    summary: '搜索记录（支持条件/排序）',
    description: '比 list 更强，支持 filter/sort 的完整语法。',
    params: {
      app_token: APP_TOKEN,
      table_id: TABLE_ID,
      view_id: { type: 'string' },
      filter: { type: 'object', desc: '过滤条件对象（JSON）' },
      sort: { type: 'array', desc: '排序数组（JSON）' },
      field_names: { type: 'array', desc: '只返回指定字段名' },
      automatic_fields: { type: 'boolean' },
      page_size: { type: 'integer', default: 100 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.post(`${tablePath(a)}/records/search`, {
        query: { page_size: a.page_size ?? 100, page_token: a.page_token },
        body: {
          ...(a.view_id ? { view_id: a.view_id } : {}),
          ...(a.filter ? { filter: a.filter } : {}),
          ...(a.sort?.length ? { sort: a.sort } : {}),
          ...(a.field_names?.length ? { field_names: a.field_names } : {}),
          ...(a.automatic_fields !== undefined
            ? { automatic_fields: a.automatic_fields }
            : {}),
        },
      }),
  },
];
