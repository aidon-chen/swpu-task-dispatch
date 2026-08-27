/**
 * 获取任务模板列表云函数
 * 主任及以上可查看本部门 / 全部模板（中心主任看全部）
 * 任务模板与普通任务同存于 tasks 集合，通过 isTemplate=true 区分
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 测试模式：与 createTask 一致，允许调试角色登录用户查看模板
const TEST_CONFIG = require('./testConfig.js');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (!users.length) return Response.permissionDenied('请先登录');

    const user = users[0];

    // 测试模式：调试角色登录只改了本地角色、未写入数据库 users.role。
    // 当云端测试开关开启且前端携带合法的 debugMode/debugRole 时，信任调试角色。
    let effectiveRole = user.role;
    if (
      TEST_CONFIG.enabled &&
      (user.role === 'debug' || user.isDebugUser === true) &&
      event.debugMode &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveRole = event.debugRole;
    }

    const userLevel = ROLE_LEVEL[effectiveRole] || 0;
    if (userLevel < ROLE_LEVEL.photo_director) {
      return Response.permissionDenied('仅主任及以上可查看模板');
    }

    // 部门主任看本部门模板 + 跨部门模板；中心主任看全部
    const query = { isTemplate: true };
    if (userLevel < ROLE_LEVEL.center_director) {
      query.$or = [
        { ownerDepartment: user.department || '' },
        { isCrossDepartment: true }
      ];
    }

    const { data: templates } = await db.collection('tasks')
      .where(query)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return Response.ok({ templates: (templates || []).map(formatTemplate) });
  } catch (err) {
    console.error('[getTemplates] 错误:', err);
    return Response.paramError(err.message || '获取模板失败');
  }
};

/**
 * 格式化模板对象（仅返回表单预填所需字段）
 */
function formatTemplate(t) {
  if (!t) return null;
  return {
    _id: t._id,
    templateName: t.templateName || t.title,
    title: t.title,
    type: t.type,
    location: t.location,
    contact: t.contact,
    description: t.description,
    deliverables: t.deliverables,
    priority: t.priority || 'normal',
    isCrossDepartment: !!t.isCrossDepartment,
    locationId: t.locationId || '',
    ownerDepartment: t.ownerDepartment || '',
    createdAt: t.createdAt ? formatDateTime(t.createdAt) : ''
  };
}

/**
 * 格式化日期时间
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
