/**
 * 更新任务云函数
 * 支持主任编辑任务、状态变更、成员操作
 * 权限校验：主任可编辑所有字段，成员仅可变更状态
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

/** 角色等级 */
const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { taskId, updates } = event;

  // 参数校验
  if (!taskId || !updates) {
    return Response.paramError('缺少必要参数：taskId, updates');
  }

  try {
    const tasksCollection = db.collection('tasks');
    const usersCollection = db.collection('users');

    // 1. 查找任务
    const { data: tasks } = await tasksCollection.doc(taskId).get();
    if (!tasks || tasks.length === 0) {
      return Response.notFound('任务不存在');
    }

    const task = tasks.length ? tasks[0] : tasks;

    // 2. 查找当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('用户不存在');
    }

    const user = users[0];
    // 调试员：测试模式（携带 debugRole）按扮演角色提权，否则等同 member
    const effectiveRole = user.role === 'debug'
      ? (event.debugMode && event.debugRole && ROLE_LEVEL[event.debugRole] ? event.debugRole : 'member')
      : user.role;
    const userLevel = ROLE_LEVEL[effectiveRole] || 0;

    // 3. 权限判断
    const isCreator = task.creatorId === user._id;
    const isAssigned = task.assignedTo && task.assignedTo.includes(user._id);
    const isDirector = userLevel >= ROLE_LEVEL.photo_director;

    // 如果只有状态变更，成员也可以操作
    const onlyStatusChange = Object.keys(updates).length === 1 && 'status' in updates;

    if (!isDirector && !isCreator && !(onlyStatusChange && isAssigned)) {
      return Response.permissionDenied('你没有权限修改此任务');
    }

    // 4. 构建更新数据
    const updateData = { updatedAt: new Date() };

    // 可更新的字段白名单
    const editableFields = [
      'title', 'type', 'startTime', 'endTime', 'location',
      'contact', 'description', 'deliverables', 'assignedTo',
      'priority', 'status', 'isCrossDepartment', 'locationId'
    ];

    for (const key of editableFields) {
      if (updates[key] !== undefined) {
        if (key === 'startTime' || key === 'endTime') {
          updateData[key] = updates[key] ? new Date(updates[key]) : null;
        } else {
          updateData[key] = updates[key];
        }
      }
    }

    // 非主任用户只能更新状态字段
    if (!isDirector) {
      // 成员只允许以下状态变更
      const allowedMemberStatus = {
        pending_to_confirmed: '确认接受',
        confirmed_to_in_progress: '开始任务',
        in_progress_to_completed: '完成任务',
        completed_to_pending: '申请调整'
      };

      // 如果包含非状态字段，权限不足
      const nonStatusKeys = Object.keys(updateData).filter(k => k !== 'status' && k !== 'updatedAt');
      if (nonStatusKeys.length > 0) {
        return Response.permissionDenied('仅主任可编辑任务详情');
      }
    }

    // 5. 执行更新
    await tasksCollection.doc(taskId).update({ data: updateData });

    // 6. 如果状态变更为取消，发送通知
    if (updateData.status === 'cancelled' && task.assignedTo && task.assignedTo.length > 0) {
      cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'task_cancelled',
          taskId,
          userIds: task.assignedTo,
          taskInfo: { title: task.title }
        }
      }).catch(err => console.error('[updateTask] 取消通知发送失败:', err));
    }

    return Response.ok({ taskId, updated: updateData }, '任务更新成功');
  } catch (err) {
    console.error('[updateTask] 错误:', err);
    return Response.paramError(err.message || '更新任务失败');
  }
};
