/**
 * 生成测试密钥云函数
 * 仅在测试模式下可用，生成可复用的测试密钥
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const TEST_CONFIG = require('./testConfig');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

/** 角色等级映射 */
const ROLE_LEVEL = {
  member: 1,
  photo_director: 2,
  video_director: 2,
  center_director: 3
};

/** 合法角色列表 */
const VALID_ROLES = Object.keys(ROLE_LEVEL).filter(r => r !== 'member');

/** 合法部门列表 */
const VALID_DEPARTMENTS = ['photography', 'video'];

/**
 * 生成随机后缀
 */
function randomSuffix(length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成测试密钥字符串
 */
function generateKeyString(role) {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DEV-${role}-${timestamp}-${randomSuffix()}`;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { role, department } = event;

  // 1. 后端测试模式校验
  if (!TEST_CONFIG.enabled) {
    console.warn('[generateTestKey] 后端测试模式未开启');
    return Response.permissionDenied('测试密钥生成仅在测试模式下可用');
  }

  // 2. 参数校验
  if (!role || !VALID_ROLES.includes(role)) {
    return Response.paramError(`角色不合法，可选：${VALID_ROLES.join('、')}`);
  }

  if (department && !VALID_DEPARTMENTS.includes(department)) {
    return Response.paramError('部门不合法');
  }

  // 3. 检查用户是否已登录（存在于 users 集合）
  const usersCollection = db.collection('users');
  const { data: users } = await usersCollection.where({ openid: OPENID }).get();

  if (users.length === 0) {
    return Response.notFound('用户不存在，请先登录');
  }

  const user = users[0];
  const keyString = generateKeyString(role);

  // 4. 写入 keys 集合
  const keysCollection = db.collection('keys');
  await keysCollection.add({
    data: {
      key: keyString,
      role,
      department: department || '',
      testKey: true,
      isUsed: false,
      createdBy: user._id,
      createdAt: new Date()
    }
  });

  console.log('[TEST_MODE] 测试密钥生成:', keyString, 'for role', role, 'by', OPENID);

  return Response.ok({
    key: keyString,
    role,
    department: department || ''
  }, '测试密钥生成成功');
};
