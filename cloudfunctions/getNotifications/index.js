/**
 * 获取当前用户的小程序内通知列表
 *
 * 鉴权：仅返回当前登录用户（按 OPENID 解析的 user._id）的通知。
 * 入参：{ page = 1, pageSize = 20 }
 * 出参：{ list, total, unreadCount, page, pageSize, hasMore }
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

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    // 1. 解析当前用户
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('请先登录');
    }
    const userId = users[0]._id;

    // 2. 分页参数
    const page = Math.max(1, event.page || 1);
    const pageSize = Math.min(50, Math.max(1, event.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const notificationsCollection = db.collection('notifications');

    // 3. 总数与未读数（并行）
    const [countRes, unreadRes] = await Promise.all([
      notificationsCollection.where({ userId }).count(),
      notificationsCollection.where({ userId, isRead: false }).count()
    ]);

    // 4. 列表（按时间倒序）
    const { data: list } = await notificationsCollection
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    const formatted = list.map((n) => ({
      _id: n._id,
      type: n.type,
      content: n.content,
      taskId: n.taskId || '',
      isRead: !!n.isRead,
      createdAt: formatTime(n.createdAt)
    }));

    return Response.ok({
      list: formatted,
      total: countRes.total,
      unreadCount: unreadRes.total,
      page,
      pageSize,
      hasMore: countRes.total > skip + formatted.length
    });
  } catch (err) {
    console.error('[getNotifications] 错误:', err);
    return Response.paramError(err.message || '获取通知失败');
  }
};
