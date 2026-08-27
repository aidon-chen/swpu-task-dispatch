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
    isCrossDepartment, locationId, isTemplate, templateName, fromTemplateId
  } = event;

  const isTpl = !!isTemplate;

  // 从模板预填（事件字段优先覆盖模板字段）
  let base = {};
  if (fromTemplateId && !isTpl) {
    base = await loadTemplate(fromTemplateId);
  }
  const merged = {
    title: (title || base.title || '').toString().trim(),
    type: type || base.type || '',
    startTime: startTime || base.startTime || '',
    endTime: endTime || base.endTime || '',
    location: (location || base.location || '').toString().trim(),
    contact: (contact || base.contact || '').toString().trim(),
    description: (description || base.description || '').toString().trim(),
    deliverables: (deliverables || base.deliverables || '').toString().trim(),
    priority: priority || base.priority || 'normal',
    isCrossDepartment: isCrossDepartment !== undefined ? !!isCrossDepartment : !!(base.isCrossDepartment),
    locationId: locationId || base.locationId || ''
  };

  // 参数校验
  if (!merged.title || !merged.type) {
    return Response.paramError('缺少必要参数：title, type');
  }
  if (!isTpl) {
    if (!merged.startTime) {
      return Response.paramError('请选择开始时间');
    }
    if (!assignedTo || assignedTo.length === 0) {
      return Response.paramError('请选择指派人员');
    }
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
      (user.role === 'debug' || user.isDebugUser === true) &&
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
      title: merged.title,
      type: merged.type,
      startTime: isTpl
        ? (merged.startTime ? new Date(merged.startTime) : null)
        : new Date(merged.startTime),
      endTime: merged.endTime ? new Date(merged.endTime) : null,
      location: merged.location,
      contact: merged.contact,
      description: merged.description,
      deliverables: merged.deliverables,
      assignedTo: isTpl ? [] : (assignedTo || []),
      creatorId: user._id,
      status: 'pending',
      priority: merged.priority,
      locationId: merged.locationId,
      isCrossDepartment: merged.isCrossDepartment,
      isTemplate: isTpl,
      templateName: isTpl ? (templateName || merged.title) : '',
      ownerDepartment: user.department || '',
      semester,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 4. 创建任务
    const tasksCollection = db.collection('tasks');
    const addRes = await tasksCollection.add({ data: taskData });
    const taskId = addRes._id;

    // 5. 异步发送通知给指派成员（不阻塞主流程；模板不通知）
    if (!isTpl) {
      sendTaskNotifications(taskId, taskData.assignedTo, taskData).catch(err => {
        console.error('[createTask] 发送通知失败:', err);
      });
    }

    return Response.ok({
      taskId,
      isTemplate: isTpl,
      task: { ...taskData, _id: taskId }
    }, isTpl ? '模板已保存' : '任务创建成功');
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
 * 加载模板字段，用于"从模板创建"时预填表单
 * @param {string} templateId - 模板任务ID
 * @returns {Object} 模板字段；找不到或非模板时返回 {}
 */
async function loadTemplate(templateId) {
  if (!templateId) return {};
  try {
    const { data } = await db.collection('tasks').doc(templateId).get();
    const t = Array.isArray(data) ? data[0] : data;
    if (!t || !t.isTemplate) return {};
    return {
      title: t.title,
      type: t.type,
      startTime: t.startTime ? new Date(t.startTime) : '',
      endTime: t.endTime ? new Date(t.endTime) : '',
      location: t.location,
      contact: t.contact,
      description: t.description,
      deliverables: t.deliverables,
      priority: t.priority || 'normal',
      isCrossDepartment: !!t.isCrossDepartment,
      locationId: t.locationId || ''
    };
  } catch (e) {
    console.error('[createTask] 加载模板失败:', e);
    return {};
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
