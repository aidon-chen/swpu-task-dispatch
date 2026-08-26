/**
 * 发送通知云函数（小程序内通知）
 *
 * 方案：向 notifications 集合写入通知记录，由前端「消息中心」主动展示，
 *       不再依赖微信订阅消息（无需用户授权、触达可靠）。
 * 调用方：createTask / updateTask / scheduleNotify（后续模块），均使用同一事件结构。
 *
 * 事件入参：
 *   type      : task_assigned | task_cancelled | reminder | task_completed
 *   taskId    : 关联任务 ID（可选，用于点击跳转）
 *   userIds   : 接收者用户 _id 数组（与 tasks.assignedTo 一致）
 *   taskInfo  : { title, startTime, location }（用于拼接文案，可选）
 *   content   : 自定义文案（可选，优先级高于自动拼接）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message })
};

/** 通知文案模板（与系统设计 §8.6 一致） */
function buildContent(type, taskInfo = {}) {
  const title = (taskInfo.title || '任务').replace(/\n/g, ' ');
  switch (type) {
    case 'task_assigned':
      return `你收到新任务：${title}`;
    case 'task_cancelled':
      return `任务已取消：${title}`;
    case 'reminder':
      return `任务即将开始：${title}（${formatTime(taskInfo.startTime)}）`;
    case 'task_completed':
      return `任务已自动完成：${title}`;
    default:
      return `你有新的通知：${title}`;
  }
}

function formatTime(date) {
  if (!date) return '即将开始';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '即将开始';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

exports.main = async (event, context) => {
  const { type, taskId, userIds, taskInfo = {}, content } = event;

  if (!type || !userIds || (Array.isArray(userIds) ? userIds.length === 0 : !userIds)) {
    return Response.paramError('缺少必要参数（type / userIds）');
  }

  // 归一化为数组
  const targets = Array.isArray(userIds) ? userIds : [userIds];

  try {
    const notificationsCollection = db.collection('notifications');
    const text = (content && String(content).trim()) || buildContent(type, taskInfo);

    // 逐接收者写入，单条失败不影响其他（如 userId 非法/已删除）
    const records = targets.map((userId) => ({
      userId,
      taskId: taskId || '',
      type,
      content: text,
      isRead: false,
      createdAt: db.serverDate()
    }));

    let written = 0;
    for (const rec of records) {
      try {
        await notificationsCollection.add({ data: rec });
        written++;
      } catch (err) {
        console.error(`[sendNotification] 写入 userId=${rec.userId} 失败:`, err.errMsg || err.message);
      }
    }

    return Response.ok(
      { written, total: records.length },
      `已写入 ${written}/${records.length} 条通知`
    );
  } catch (err) {
    console.error('[sendNotification] 错误:', err);
    return Response.paramError(err.message || '发送通知失败');
  }
};
