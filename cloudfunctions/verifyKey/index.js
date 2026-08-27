/**
 * 权限密钥验证云函数
 * 验证一次性密钥，升级用户角色
 * 一密钥一用户，使用后标记为已使用
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const TEST_CONFIG = require('./testConfig');

/** 响应格式 */
const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { key } = event;

  // 参数校验
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return Response.paramError('密钥不能为空');
  }

  try {
    const keysCollection = db.collection('keys');
    const usersCollection = db.collection('users');

    // 1. 查找密钥
    const { data: keys } = await keysCollection.where({ key: key.trim() }).get();

    if (keys.length === 0) {
      return Response.notFound('密钥不存在');
    }

    const keyRecord = keys[0];

    // 2. 判断是否为测试密钥
    const isTestKey = keyRecord.testKey === true;

    if (isTestKey) {
      // 测试密钥需后端测试模式开启
      if (!TEST_CONFIG.enabled) {
        console.warn('[verifyKey] 测试密钥校验：后端测试模式未开启');
        return Response.permissionDenied('测试密钥仅在测试模式下可用');
      }
      console.log('[TEST_MODE] 测试密钥验证:', keyRecord.key, '→', keyRecord.role);
    } else {
      // 正式密钥检查是否已被使用
      if (keyRecord.isUsed) {
        return Response.paramError('该密钥已被使用');
      }
    }

    // 3. 查找当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return Response.notFound('用户不存在，请先登录');
    }

    const user = users[0];

    // 调试员账号跳过密钥升级（它已可扮演任意角色，防止密钥流程覆盖其 role='debug' 身份）
    if (user.role === 'debug') {
      return Response.paramError('调试员账号无需密钥升级');
    }

    // 4. 检查用户是否已有相同或更高角色
    const roleLevel = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };
    const currentLevel = roleLevel[user.role] || 0;
    const keyLevel = roleLevel[keyRecord.role] || 0;

    if (currentLevel >= keyLevel) {
      return Response.paramError('你当前的角色已大于或等于密钥对应的角色');
    }

    // 5. 使用事务更新密钥状态和用户角色
    // 注意：小程序云开发基础版不支持事务，使用两步更新
    if (!isTestKey) {
      // 正式密钥：标记为已使用
      await keysCollection.doc(keyRecord._id).update({
        data: {
          isUsed: true,
          usedBy: user._id,
          usedAt: new Date()
        }
      });
    }

    await usersCollection.doc(user._id).update({
      data: {
        role: keyRecord.role,
        updatedAt: new Date()
      }
    });

    const message = isTestKey ? '测试密钥验证成功' : '角色升级成功';
    return Response.ok({
      role: keyRecord.role,
      previousRole: user.role,
      isTestKey
    }, message);
  } catch (err) {
    console.error('[verifyKey] 错误:', err);
    return Response.paramError(err.message || '验证失败，请重试');
  }
};
