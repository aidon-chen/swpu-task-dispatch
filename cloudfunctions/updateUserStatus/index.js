/**
 * 更新用户状态云函数
 * 成员设置自己的状态（可用/忙碌/不可用）
 * 支持设置固定每周空闲时间段
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { status, reason, images, startDate, endDate, weeklySchedule } = event;

  try {
    const usersCollection = db.collection('users');
    const statusCollection = db.collection('user_status');

    // 1. 查找当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在');
    }

    const user = users[0];

    // 2. 处理周固定时间设置
    if (weeklySchedule && Array.isArray(weeklySchedule)) {
      // 删除旧的设置并创建新的
      await updateWeeklySchedule(user._id, weeklySchedule);
      return Response.ok(null, '固定时间段已更新');
    }

    // 3. 处理状态更新
    if (!status) {
      return Response.paramError('缺少状态参数');
    }

    const validStatuses = ['available', 'busy', 'unavailable'];
    if (!validStatuses.includes(status)) {
      return Response.paramError('无效的状态值');
    }

    // 4. 检查上次状态更新时间（避免频繁更新）
    const { data: recentStatus } = await statusCollection
      .where({ userId: user._id })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (recentStatus.length > 0) {
      const lastUpdate = new Date(recentStatus[0].createdAt).getTime();
      const now = Date.now();
      // 1分钟内不重复更新
      if (now - lastUpdate < 60000 && recentStatus[0].status === status) {
        return Response.ok({ unchanged: true }, '状态未变化');
      }
    }

    // 5. 创建状态记录
    const statusData = {
      userId: user._id,
      status,
      reason: reason || '',
      images: images || [],
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      createdAt: new Date()
    };

    await statusCollection.add({ data: statusData });

    return Response.ok({ status: statusData }, '状态更新成功');
  } catch (err) {
    console.error('[updateUserStatus] 错误:', err);
    return Response.paramError(err.message || '更新状态失败');
  }
};

/**
 * 更新每周固定空闲时间段
 */
async function updateWeeklySchedule(userId, weeklySchedule) {
  // 简单实现：删除旧数据，插入新数据
  // 在实际项目中可考虑使用一个独立集合或更新用户文档
  const usersCollection = db.collection('users');

  await usersCollection.doc(userId).update({
    data: {
      weeklySchedule,
      updatedAt: new Date()
    }
  });
}
