/**
 * 定时任务扫描云函数（由云函数定时器每 30 分钟自动触发）
 *
 * 职责：
 *  1) 任务提醒：扫描 startTime ∈ [now-5m, now+2h] 且 status='confirmed' 的任务，
 *     对每个 assignedTo 成员写入 reminder 通知；同一任务只提醒一次（靠 notifiedAt 防重）。
 *  2) 自动完结：扫描 endTime < now 且 status='in_progress' 的任务，置为 completed
 *     并写入 task_completed 通知（不覆盖人工已改结果；幂等）。
 *
 * 注意：定时器触发时 OPENID 为空，本函数直接操作集合，不依赖用户上下文。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const NOTIFY_TYPES = {
  reminder: 'reminder',
  completed: 'task_completed'
};

function formatTime(date) {
  if (!date) return '即将开始';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '即将开始';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function addNotification(userId, type, taskId, title) {
  const content =
    type === NOTIFY_TYPES.reminder
      ? `任务即将开始：${title}（${formatTime(null)}）`
      : `任务已自动完成：${title}`;
  try {
    await db.collection('notifications').add({
      data: { userId, taskId: taskId || '', type, content, isRead: false, createdAt: db.serverDate() }
    });
  } catch (err) {
    console.error(`[scheduleNotify] 写通知失败 userId=${userId}:`, err.errMsg || err.message);
  }
}

exports.main = async (event, context) => {
  const now = new Date();
  const nowMinus5 = new Date(now.getTime() - 5 * 60 * 1000);
  const nowPlus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const stats = { reminded: 0, autoCompleted: 0, errors: 0 };
  const tasksCollection = db.collection('tasks');

  try {
    // ---- 1. 任务前 2 小时提醒 ----
    const { data: dueTasks } = await tasksCollection
      .where({
        status: 'confirmed',
        startTime: _.gte(nowMinus5).and(_.lte(nowPlus2h))
      })
      .limit(100)
      .get();

    for (const task of dueTasks) {
      // 已提醒过则跳过（防重）
      if (task.notifiedAt) continue;
      const title = (task.title || '任务').replace(/\n/g, ' ');
      const receivers = task.assignedTo || [];
      for (const userId of receivers) {
        await addNotification(userId, NOTIFY_TYPES.reminder, task._id, title);
        stats.reminded++;
      }
      // 标记本轮已提醒
      try {
        await tasksCollection.doc(task._id).update({ data: { notifiedAt: db.serverDate() } });
      } catch (e) {
        stats.errors++;
        console.error(`[scheduleNotify] 更新 notifiedAt 失败 task=${task._id}:`, e.message);
      }
    }

    // ---- 2. 过期自动完结 ----
    const { data: expiredTasks } = await tasksCollection
      .where({
        status: 'in_progress',
        endTime: _.lt(now)
      })
      .limit(100)
      .get();

    for (const task of expiredTasks) {
      const title = (task.title || '任务').replace(/\n/g, ' ');
      try {
        await tasksCollection.doc(task._id).update({ data: { status: 'completed' } });
        for (const userId of task.assignedTo || []) {
          await addNotification(userId, NOTIFY_TYPES.completed, task._id, title);
        }
        stats.autoCompleted++;
      } catch (e) {
        stats.errors++;
        console.error(`[scheduleNotify] 自动完结失败 task=${task._id}:`, e.message);
      }
    }

    return { code: 0, data: stats, message: '定时扫描完成' };
  } catch (err) {
    console.error('[scheduleNotify] 错误:', err);
    return { code: 1, data: stats, message: err.message || '定时扫描失败' };
  }
};
