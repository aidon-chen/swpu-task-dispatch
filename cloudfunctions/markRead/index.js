/**
 * 标记通知为已读
 *
 * 鉴权：仅能标记当前用户自己的通知。
 * 入参：
 *   ids : 要标记已读的通知 _id 数组（与 all 二选一）
 *   all : true 时标记该用户全部未读通知为已读
 * 出参：{ updated }
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message })
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { ids, all } = event;

  if (!all && (!ids || ids.length === 0)) {
    return Response.paramError('请提供 ids 或 all=true');
  }

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('请先登录');
    }
    const userId = users[0]._id;

    const notificationsCollection = db.collection('notifications');
    const query = { userId, isRead: false };
    if (!all && Array.isArray(ids)) {
      query._id = _.in(ids);
    }

    const res = await notificationsCollection.where(query).update({
      data: { isRead: true }
    });

    return Response.ok({ updated: res.stats.updated || 0 }, '标记成功');
  } catch (err) {
    console.error('[markRead] 错误:', err);
    return Response.paramError(err.message || '标记已读失败');
  }
};
