/**
 * 生成正式密钥云函数
 * 仅视觉中心主任可调用，生成一次性正式密钥（非测试密钥）
 * 一密钥一用户，使用后由 verifyKey 标记为已使用
 *
 * 事件参数：
 *  - role: 目标角色（photo_director / video_director / member）
 *  - department: 目标部门（photography / video，role 为 member 时可省略）
 *  - count: 生成数量（默认 1，最大 10）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_CONFIG = require('./testConfig');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

/** 可生成的角色（中心主任不为自己生成更高级密钥） */
const GENERATABLE_ROLES = ['photo_director', 'video_director', 'member'];

/** 合法部门 */
const VALID_DEPARTMENTS = ['photography', 'video'];

/** 不含易混淆字符（0/O/1/I）的字符集 */
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 生成指定长度随机密钥
 */
function randomKey(length = 8) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += KEY_CHARS.charAt(Math.floor(Math.random() * KEY_CHARS.length));
  }
  return result;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { role, department, count } = event;

  // 1. 参数校验
  if (!role || !GENERATABLE_ROLES.includes(role)) {
    return Response.paramError(`角色不合法，可选：${GENERATABLE_ROLES.join('、')}`);
  }

  let targetDepartment = '';
  if (role !== 'member') {
    targetDepartment = department || '';
    if (!VALID_DEPARTMENTS.includes(targetDepartment)) {
      return Response.paramError('部门不合法，可选：photography、video');
    }
  }

  let genCount = parseInt(count, 10);
  if (!genCount || genCount < 1) genCount = 1;
  if (genCount > 10) genCount = 10;

  try {
    const usersCollection = db.collection('users');
    const keysCollection = db.collection('keys');

    // 2. 当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在，请先登录');
    }
    const currentUser = users[0];

    // 3. 权限：仅视觉中心主任（调试模式信任前端 debugRole）
    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    if (
      TEST_CONFIG.enabled &&
      event.debugMode === true &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[event.debugRole];
      console.log('[generateKey] 测试模式：信任调试角色', event.debugRole);
    }

    if (effectiveLevel < ROLE_LEVEL.center_director) {
      return Response.permissionDenied('仅视觉中心主任可生成正式密钥');
    }

    // 4. 生成密钥（保证唯一）
    const generated = [];
    for (let i = 0; i < genCount; i++) {
      let keyStr = '';
      for (let attempt = 0; attempt < 6; attempt++) {
        keyStr = randomKey(8);
        const { data: exist } = await keysCollection.where({ key: keyStr }).get();
        if (exist.length === 0) break;
        keyStr = '';
      }
      if (!keyStr) {
        return Response.paramError('密钥生成冲突，请重试');
      }

      const record = {
        key: keyStr,
        role,
        department: targetDepartment,
        testKey: false,
        isUsed: false,
        createdBy: currentUser._id,
        createdAt: new Date()
      };
      await keysCollection.add({ data: record });
      generated.push({
        key: keyStr,
        role,
        department: targetDepartment
      });
      console.log('[generateKey] 正式密钥生成:', keyStr, 'role=', role, 'by', OPENID);
    }

    return Response.ok(
      { keys: generated, count: generated.length },
      `成功生成 ${generated.length} 个密钥`
    );
  } catch (err) {
    console.error('[generateKey] 错误:', err);
    return Response.paramError(err.message || '生成密钥失败');
  }
};
