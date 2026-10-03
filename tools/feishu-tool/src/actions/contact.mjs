/**
 * 通讯录（contact）能力。
 *
 * 注意：接口级权限通过 ≠ 有数据。还要在开发者后台设置「通讯录权限范围」，
 * 否则 users.list 会返回空、department 相关会报 40004 no dept authority error。
 */

const USER_ID_TYPE = {
  type: 'string',
  enum: ['open_id', 'union_id', 'user_id'],
  desc: '用户 ID 类型，默认 open_id',
};

export const contactActions = [
  {
    name: 'contact.scopes',
    group: 'contact',
    summary: '查看应用的通讯录权限范围',
    description:
      '返回应用当前能看到的用户/部门 ID。做通讯录相关调用前先跑这个最快定位问题。',
    params: {},
    handler: (c) => c.get('/contact/v3/scopes'),
  },
  {
    name: 'contact.users.list',
    group: 'contact',
    summary: '获取通讯录用户列表',
    description:
      '不传 department_id 时返回权限范围内的用户。返回空说明通讯录权限范围没配。',
    params: {
      department_id: { type: 'string', desc: '部门 ID，根部门为 0' },
      user_id_type: { ...USER_ID_TYPE, default: 'open_id' },
      page_size: { type: 'integer', default: 20 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get('/contact/v3/users', {
        query: {
          department_id: a.department_id,
          user_id_type: a.user_id_type || 'open_id',
          page_size: a.page_size ?? 20,
          page_token: a.page_token,
        },
      }),
  },
  {
    name: 'contact.users.get',
    group: 'contact',
    summary: '获取单个用户信息',
    params: {
      user_id: {
        type: 'string',
        required: true,
        desc: '用户 ID，类型由 user_id_type 决定',
      },
      user_id_type: { ...USER_ID_TYPE, default: 'open_id' },
    },
    handler: (c, a) =>
      c.get(`/contact/v3/users/${a.user_id}`, {
        query: { user_id_type: a.user_id_type || 'open_id' },
      }),
  },
  {
    name: 'contact.users.batch_get_id',
    group: 'contact',
    summary: '用邮箱/手机号换用户 ID',
    description:
      '需要 contact:user.id:readonly 权限。emails 与 mobiles 至少传一个，逗号分隔。',
    params: {
      emails: { type: 'array', desc: '邮箱列表' },
      mobiles: { type: 'array', desc: '手机号列表' },
      user_id_type: { ...USER_ID_TYPE, default: 'open_id' },
    },
    handler: (c, a) => {
      if (!a.emails?.length && !a.mobiles?.length) {
        throw new Error('emails 与 mobiles 至少传一个');
      }
      return c.post('/contact/v3/users/batch_get_id', {
        query: { user_id_type: a.user_id_type || 'open_id' },
        body: { emails: a.emails ?? [], mobiles: a.mobiles ?? [] },
      });
    },
  },
  {
    name: 'contact.departments.list',
    group: 'contact',
    summary: '获取部门列表',
    params: {
      parent_department_id: { type: 'string', desc: '父部门 ID，根部门为 0' },
      department_id_type: {
        type: 'string',
        enum: ['open_department_id', 'department_id'],
        default: 'open_department_id',
      },
      user_id_type: { ...USER_ID_TYPE, default: 'open_id' },
      page_size: { type: 'integer', default: 20 },
      page_token: { type: 'string' },
    },
    handler: (c, a) =>
      c.get('/contact/v3/departments', {
        query: {
          parent_department_id: a.parent_department_id,
          department_id_type: a.department_id_type || 'open_department_id',
          user_id_type: a.user_id_type || 'open_id',
          page_size: a.page_size ?? 20,
          page_token: a.page_token,
        },
      }),
  },
  {
    name: 'contact.departments.get',
    group: 'contact',
    summary: '获取单个部门信息',
    params: {
      department_id: { type: 'string', required: true },
      department_id_type: {
        type: 'string',
        enum: ['open_department_id', 'department_id'],
        default: 'open_department_id',
      },
      user_id_type: { ...USER_ID_TYPE, default: 'open_id' },
    },
    handler: (c, a) =>
      c.get(`/contact/v3/departments/${a.department_id}`, {
        query: {
          department_id_type: a.department_id_type || 'open_department_id',
          user_id_type: a.user_id_type || 'open_id',
        },
      }),
  },
];
