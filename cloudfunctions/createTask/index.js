/**
 * 创建任务云函数
 * 主任权限：创建新任务，自动发送通知给指派成员
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 云函数侧测试模式配置：仅当 enabled=true 时才接受前端传入的调试角色
const TEST_CONFIG = require('./testConfig.js');

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
  const {
    title, type, startTime, endTime, location, contact,
    description, deliverables, assignedTo, priority,
    isCrossDepartment, locationId
  } = event;

  // 参数校验
  if (!title || !type || !startTime || !assignedTo || assignedTo.length === 0) {
    return Response.paramError('缺少必要参数：title, type, startTime, assignedTo');
  }

  try {
    // 1. 验证用户权限
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('用户不存在');
    }

    const user = users[0];

    // 测试模式：调试角色登录只改了本地角色、未写入数据库 users.role。
    // 当云端测试开关开启且前端携带合法的 debugMode/debugRole 时，信任调试角色；
    // 否则一律回退到数据库真实角色（正式版 enabled=false 时自然走这里）。
    let effectiveRole = user.role;
    if (
      TEST_CONFIG.enabled &&
      TEST_CONFIG.allowDebugRoleOverride &&
      event.debugMode &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveRole = event.debugRole;
      console.log('[createTask] 测试模式：使用调试角色', effectiveRole);
    }

    const userLevel = ROLE_LEVEL[effectiveRole] || 0;
    if (userLevel < ROLE_LEVEL.photo_director) {
      return Response.permissionDenied('仅主任及以上角色可创建任务');
    }

    // 2. 获取当前学期
    const semester = getCurrentSemester();

    // 3. 构建任务数据
    const taskData = {
      title: title.trim(),
      type,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      location: location || '',
      contact: contact || '',
      description: description || '',
      deliverables: deliverables || '',
      assignedTo,
      creatorId: user._id,
      status: 'pending',
      priority: priority || 'normal',
      locationId: locationId || '',
      isCrossDepartment: !!isCrossDepartment,
      semester,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 4. 创建任务
    const tasksCollection = db.collection('tasks');
    const addRes = await tasksCollection.add({ data: taskData });
    const taskId = addRes._id;

    // 5. 异步发送通知给指派成员（不阻塞主流程）
    sendTaskNotifications(taskId, assignedTo, taskData).catch(err => {
      console.error('[createTask] 发送通知失败:', err);
    });

    return Response.ok({
      taskId,
      task: { ...taskData, _id: taskId }
    }, '任务创建成功');
  } catch (err) {
    console.error('[createTask] 错误:', err);
    return Response.paramError(err.message || '创建任务失败');
  }
};

/**
 * 发送任务指派通知
 */
async function sendTaskNotifications(taskId, userIds, taskData) {
  try {
    await cloud.callFunction({
      name: 'sendNotification',
      data: {
        type: 'task_assigned',
        taskId,
        userIds,
        taskInfo: {
          title: taskData.title,
          startTime: taskData.startTime,
          location: taskData.location
        }
      }
    });
  } catch (err) {
    console.error('[createTask] 通知发送失败:', err);
  }
}

/**
 * 获取当前学期
 */
function getCurrentSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 2 && month <= 6) return `${year}-spring`;
  if (month >= 9) return `${year}-autumn`;
  return `${year - 1}-autumn`;
}
