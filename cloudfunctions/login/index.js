/**
 * 登录云函数
 * 处理微信授权登录和新用户注册
 * 自动获取用户 openid，管理用户信息
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/** 响应格式 */
const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, department, nickName, avatarUrl, userId } = event;

  try {
    // 处理注册请求
    if (action === 'register') {
      return await handleRegister(OPENID, userId, department, nickName, avatarUrl);
    }

    // 默认：登录/查询用户
    return await handleLogin(OPENID, nickName, avatarUrl);
  } catch (err) {
    console.error('[login] 错误:', err);
    return Response.paramError(err.message || '服务器错误');
  }
};

/**
 * 处理登录
 * 查询用户是否存在，存在则更新信息返回，不存在则返回 isNew=true
 */
async function handleLogin(openid, nickName, avatarUrl) {
  const usersCollection = db.collection('users');

  // 查询是否存在该 openid 的用户
  const { data: users } = await usersCollection.where({ openid }).get();

  if (users.length > 0) {
    // 老用户：更新昵称和头像
    const user = users[0];
    const updateData = { updatedAt: new Date() };

    if (nickName) updateData.name = nickName;
    if (avatarUrl) updateData.avatar = avatarUrl;

    if (Object.keys(updateData).length > 1) {
      await usersCollection.doc(user._id).update({ data: updateData });
      user.name = updateData.name || user.name;
      user.avatar = updateData.avatar || user.avatar;
    }

    return Response.ok({ user, isNew: false });
  }

  // 新用户：返回 isNew=true，让前端选择部门
  const newUser = {
    openid,
    name: nickName || '新同学',
    avatar: avatarUrl || '',
    department: '', // 待注册时填写
    role: 'member', // 默认普通成员
    semester: getCurrentSemester(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const addRes = await usersCollection.add({ data: newUser });
  newUser._id = addRes._id;

  return Response.ok({ user: newUser, isNew: true });
}

/**
 * 处理注册（选择部门后）
 */
async function handleRegister(openid, userId, department, nickName, avatarUrl) {
  if (!department || !userId) {
    return Response.paramError('缺少部门信息或用户ID');
  }

  const validDepts = ['photography', 'video'];
  if (!validDepts.includes(department)) {
    return Response.paramError('无效的部门');
  }

  const usersCollection = db.collection('users');

  try {
    await usersCollection.doc(userId).update({
      data: {
        department,
        name: nickName || '新同学',
        avatar: avatarUrl || '',
        updatedAt: new Date()
      }
    });

    // 返回更新后的用户信息
    const { data: user } = await usersCollection.doc(userId).get();

    return Response.ok(user);
  } catch (err) {
    console.error('[register] 更新用户失败:', err);
    return Response.paramError('注册失败，请重试');
  }
}

/**
 * 获取当前学期
 * 春季(2-6月)、秋季(9-次年1月)
 */
function getCurrentSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 2 && month <= 6) {
    return `${year}-spring`;
  }
  if (month >= 9) {
    return `${year}-autumn`;
  }
  return `${year - 1}-autumn`;
}
