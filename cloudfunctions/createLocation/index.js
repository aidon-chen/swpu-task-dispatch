/**
 * 机位管理云函数
 * 主任可创建、编辑、删除机位
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数侧测试模式配置：仅当 enabled=true 时才接受前端传入的调试角色
const TEST_CONFIG = require('./testConfig.js');

/**
 * 解析"有效角色"
 * 测试模式且前端携带合法 debugRole 时，信任调试角色；否则回退数据库真实角色。
 */
function resolveEffectiveRole(dbRole, event) {
  if (
    TEST_CONFIG.enabled &&
    TEST_CONFIG.allowDebugRoleOverride &&
    event.debugMode &&
    event.debugRole &&
    ROLE_LEVEL[event.debugRole]
  ) {
    console.log('[createLocation] 测试模式：使用调试角色', event.debugRole);
    return event.debugRole;
  }
  return dbRole;
}

const Response = {
  ok: (data, msg = '成功') => ({ code: 0, data, message: msg }),
  paramError: (msg = '参数错误') => ({ code: 1, data: null, message: msg }),
  permissionDenied: (msg = '权限不足') => ({ code: 2, data: null, message: msg }),
  notFound: (msg = '数据不存在') => ({ code: 3, data: null, message: msg })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, locationId, name, description, notes, images, tags, updates } = event;

  try {
    // 查找用户
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) return Response.permissionDenied('请先登录');

    const user = users[0];
    const effectiveRole = resolveEffectiveRole(user.role, event);
    const userLevel = ROLE_LEVEL[effectiveRole] || 0;

    // 删除操作
    if (action === 'delete') {
      if (!locationId) return Response.paramError('缺少机位ID');
      if (userLevel < ROLE_LEVEL.photo_director) return Response.permissionDenied('仅主任可删除机位');

      await db.collection('locations').doc(locationId).remove();
      return Response.ok(null, '机位已删除');
    }

    // 更新操作
    if (action === 'update') {
      if (!locationId) return Response.paramError('缺少机位ID');
      if (userLevel < ROLE_LEVEL.photo_director) return Response.permissionDenied('仅主任可编辑机位');

      const updateData = { ...updates, updatedAt: new Date() };
      await db.collection('locations').doc(locationId).update({ data: updateData });
      return Response.ok(null, '机位已更新');
    }

    // 创建操作
    if (!name) return Response.paramError('缺少机位名称');
    if (userLevel < ROLE_LEVEL.photo_director) return Response.permissionDenied('仅主任可创建机位');

    const locationData = {
      name, description: description || '', notes: notes || '',
      images: images || [], tags: tags || [],
      createdBy: user._id,
      createdAt: new Date(), updatedAt: new Date()
    };

    const res = await db.collection('locations').add({ data: locationData });
    return Response.ok({ _id: res._id, ...locationData }, '机位创建成功');
  } catch (err) {
    console.error('[createLocation] 错误:', err);
    return Response.paramError(err.message || '操作失败');
  }
};
