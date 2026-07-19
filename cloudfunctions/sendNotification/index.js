/**
 * 发送通知云函数
 * 使用微信订阅消息，向指定用户发送任务相关通知
 * 支持：任务指派、开始前提醒、任务取消
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, msg = '成功') => ({ code: 0, data, message: msg }),
  paramError: (msg = '参数错误') => ({ code: 1, data: null, message: msg })
};

/**
 * 通知模板ID配置
 * ⚠️ 需在微信公众平台 (mp.weixin.qq.com) → 功能 → 订阅消息 中申请
 *    申请通过后将真实模板ID替换以下占位符
 */
const TEMPLATE_IDS = {
  /** 任务指派通知 - 申请人收到新任务时推送 */
  task_assigned: 'your-template-id-task-assigned',     // TODO: 替换为真实模板ID
  /** 任务提醒通知 - 任务开始前2小时推送 */
  task_reminder: 'your-template-id-task-reminder',     // TODO: 替换为真实模板ID
  /** 任务取消通知 - 任务被主任取消时推送 */
  task_cancelled: 'your-template-id-task-cancelled'    // TODO: 替换为真实模板ID
};

exports.main = async (event, context) => {
  const { type, taskId, userIds, taskInfo } = event;

  if (!type || !taskId || !userIds || userIds.length === 0) {
    return Response.paramError('缺少必要参数');
  }

  try {
    const usersCollection = db.collection('users');

    // 获取用户openid列表
    const { data: users } = await usersCollection
      .where({ _id: _.in(userIds) })
      .field({ openid: true, name: true })
      .get();

    if (users.length === 0) {
      return Response.ok({ sent: 0 }, '无有效用户');
    }

    const openids = users.map(u => u.openid);

    // 根据类型构建消息内容
    let templateId;
    let messageData;

    switch (type) {
      case 'task_assigned':
        templateId = TEMPLATE_IDS.task_assigned;
        messageData = buildAssignedMessage(taskInfo);
        break;
      case 'task_reminder':
        templateId = TEMPLATE_IDS.task_reminder;
        messageData = buildReminderMessage(taskInfo);
        break;
      case 'task_cancelled':
        templateId = TEMPLATE_IDS.task_cancelled;
        messageData = buildCancelledMessage(taskInfo);
        break;
      default:
        return Response.paramError('未知通知类型');
    }

    // 发送订阅消息
    let successCount = 0;
    for (const openid of openids) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId,
          data: messageData,
          page: `/pages/task-detail/task-detail?id=${taskId}`,
          miniprogramState: 'formal'
        });
        successCount++;
      } catch (err) {
        // 用户未订阅或模板不存在
        console.error(`[通知] 发送给 ${openid} 失败:`, err.errMsg || err.message);
      }
    }

    return Response.ok({ sent: successCount, total: openids.length }, `已发送 ${successCount}/${openids.length} 条通知`);
  } catch (err) {
    console.error('[sendNotification] 错误:', err);
    return Response.paramError(err.message || '发送通知失败');
  }
};

/** 构建任务指派消息 */
function buildAssignedMessage(taskInfo) {
  return {
    thing1: { value: (taskInfo.title || '新任务').substring(0, 20) },
    time2: { value: formatForTemplate(taskInfo.startTime) },
    thing3: { value: (taskInfo.location || '待定').substring(0, 20) }
  };
}

/** 构建任务提醒消息 */
function buildReminderMessage(taskInfo) {
  return {
    thing1: { value: (taskInfo.title || '任务').substring(0, 20) },
    time2: { value: formatForTemplate(taskInfo.startTime) },
    thing3: { value: '任务将在2小时后开始，请做好准备' }
  };
}

/** 构建任务取消消息 */
function buildCancelledMessage(taskInfo) {
  return {
    thing1: { value: (taskInfo.title || '任务').substring(0, 20) },
    phrase2: { value: '已取消' },
    thing3: { value: '任务已被主任取消，如有疑问请联系主任' }
  };
}

/** 格式化时间为模板格式 */
function formatForTemplate(date) {
  if (!date) return '待定';
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}
