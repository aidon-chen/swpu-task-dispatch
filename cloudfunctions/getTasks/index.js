/**
 * 获取任务列表云函数
 * 根据用户角色返回不同范围的任务数据
 * 支持筛选、分页、搜索
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

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    // 1. 获取当前用户
    const usersCollection = db.collection('users');
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return Response.permissionDenied('请先登录');
    }

    const user = users[0];
    const userLevel = ROLE_LEVEL[user.role] || 0;

    // 2. 如果指定了 taskId，返回单个任务详情
    if (event.taskId) {
      return await getTaskDetail(event.taskId, user, event.includeMembers);
    }

    // 3. 构建查询条件
    const query = buildQuery(event, user, userLevel);

    // 4. 分页参数
    const page = Math.max(1, event.page || 1);
    const pageSize = Math.min(50, Math.max(1, event.pageSize || 20));
    const skip = (page - 1) * pageSize;

    // 5. 查询任务
    const tasksCollection = db.collection('tasks');
    const countRes = await tasksCollection.where(query).count();
    const total = countRes.total;

    const { data: tasks } = await tasksCollection
      .where(query)
      .orderBy('startTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 6. 格式化返回数据
    const formattedTasks = tasks.map(formatTask);

    // 7. 统计各状态数量
    const stats = await getTaskStats(query, tasksCollection);

    return Response.ok({
      tasks: formattedTasks,
      total,
      stats,
      page,
      pageSize
    });
  } catch (err) {
    console.error('[getTasks] 错误:', err);
    return Response.paramError(err.message || '获取任务列表失败');
  }
};

/**
 * 获取单个任务详情
 */
async function getTaskDetail(taskId, user, includeMembers) {
  const tasksCollection = db.collection('tasks');

  try {
    const { data: tasks } = await tasksCollection.doc(taskId).get();
    if (!tasks || tasks.length === 0) {
      return Response.notFound('任务不存在');
    }

    const task = tasks.length ? tasks[0] : tasks;
    const result = {
      tasks: [formatTask(task)]
    };

    // 如果需要成员详情
    if (includeMembers && task.assignedTo && task.assignedTo.length > 0) {
      const { data: members } = await db.collection('users')
        .where({ _id: _.in(task.assignedTo) })
        .field({ name: true, avatar: true, department: true, role: true })
        .get();

      // 获取成员状态
      const memberIds = members.map(m => m._id);
      const { data: statuses } = await db.collection('user_status')
        .where({ userId: _.in(memberIds) })
        .orderBy('createdAt', 'desc')
        .get();

      const statusMap = {};
      statuses.forEach(s => {
        if (!statusMap[s.userId]) {
          statusMap[s.userId] = s.status;
        }
      });

      result.members = members.map(m => ({
        ...m,
        status: statusMap[m._id] || 'available'
      }));
    }

    // 如果有关联机位
    if (task.locationId) {
      try {
        const { data: locations } = await db.collection('locations')
          .doc(task.locationId).get();
        if (locations) {
          result.location = locations.length ? locations[0] : locations;
        }
      } catch (e) {
        // 机位可能已删除
      }
    }

    return Response.ok(result);
  } catch (err) {
    return Response.notFound('任务不存在');
  }
}

/**
 * 构建查询条件
 */
function buildQuery(event, user, userLevel) {
  const query = {};

  // 默认排除任务模板（模板通过 getTemplates 单独获取）
  query.isTemplate = _.neq(true);

  // 任务状态筛选
  if (event.status) {
    query.status = event.status;
  } else {
    // 默认排除已取消的
    query.status = _.neq('cancelled');
  }

  // 根据角色缩小范围
  if (event.myTasks || userLevel < ROLE_LEVEL.photo_director) {
    // 普通成员只看自己的任务
    query.assignedTo = user._id;
  } else if (userLevel === ROLE_LEVEL.photo_director || userLevel === ROLE_LEVEL.video_director) {
    // 部门主任看自己部门的任务
    // 通过创建者或指派人员的部门来筛选
    // 简化方案：如果非跨部门任务，只看本部门
    query.$or = [
      { creatorId: user._id },
      { isCrossDepartment: true }
    ];
  }
  // 视觉中心主任看所有任务（不添加额外筛选）

  // 关键词搜索
  if (event.keyword) {
    const keyword = event.keyword.trim();
    query.title = db.RegExp({
      regexp: keyword,
      options: 'i'
    });
  }

  return query;
}

/**
 * 格式化任务对象
 */
function formatTask(task) {
  if (!task) return null;

  return {
    ...task,
    startTime: task.startTime ? formatDateTime(task.startTime) : '',
    endTime: task.endTime ? formatDateTime(task.endTime) : '',
    createdAt: task.createdAt ? formatDateTime(task.createdAt) : '',
    updatedAt: task.updatedAt ? formatDateTime(task.updatedAt) : ''
  };
}

/**
 * 格式化日期时间
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 获取任务状态统计
 */
async function getTaskStats(query, collection) {
  try {
    const statuses = ['pending', 'confirmed', 'in_progress', 'completed'];

    const counts = {};
    for (const status of statuses) {
      const { total } = await collection.where({ ...query, status }).count();
      counts[status] = total;
    }

    return {
      pending: counts.pending || 0,
      confirmed: counts.confirmed || 0,
      inProgress: counts.in_progress || 0,
      completed: counts.completed || 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0)
    };
  } catch (err) {
    console.error('[getTasks] 统计失败:', err);
    return { pending: 0, confirmed: 0, inProgress: 0, completed: 0, total: 0 };
  }
}
