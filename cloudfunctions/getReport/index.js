/**
 * 统计报表云函数
 * 按指派成员聚合任务量、完成率、工时
 * 权限范围：成员只看自己；部门主任看本部门；视觉中心主任看全部（可按 department 过滤）
 *
 * 事件参数：
 *  - period: 'month' | 'semester' | 'custom'
 *  - year, month（period=month 时可指定，缺省为当前月）
 *  - semester: 'YYYY年春季学期' / 'YYYY年秋季学期'（period=semester 时）
 *  - startDate, endDate（period=custom 时，YYYY-MM-DD）
 *  - department: 部门过滤（仅中心主任可用）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_CONFIG = require('./testConfig');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

/**
 * 根据 period 计算查询的日期范围
 */
function getDateRange(event) {
  const now = new Date();
  const period = event.period || 'semester';

  if (period === 'month') {
    const year = event.year || now.getFullYear();
    const month = event.month || (now.getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return { start, end };
  }

  if (period === 'custom') {
    if (!event.startDate || !event.endDate) return null; // 不限制
    const start = new Date(event.startDate);
    const end = new Date(event.endDate + ' 23:59:59');
    return { start, end };
  }

  // semester
  const name = event.semester || '';
  const match = name.match(/(\d{4})年(春季|秋季)学期/);
  let year = now.getFullYear();
  let season = 'autumn';
  if (match) {
    year = parseInt(match[1], 10);
    season = match[2] === '春季' ? 'spring' : 'autumn';
  } else {
    // 缺省当前学期
    const m = now.getMonth() + 1;
    season = (m >= 2 && m <= 6) ? 'spring' : 'autumn';
  }

  if (season === 'spring') {
    return {
      start: new Date(year, 1, 1),          // 2/1
      end: new Date(year, 5, 30, 23, 59, 59) // 6/30
    };
  }
  // autumn: 当年 9/1 ~ 次年 1/31
  return {
    start: new Date(year, 8, 1),
    end: new Date(year + 1, 0, 31, 23, 59, 59)
  };
}

/**
 * 核心统计计算（getReport 与 exportReport 共用逻辑）
 */
async function computeReport(event, currentUser, effectiveLevel) {
  // 1. 确定统计范围用户
  let deptQuery = {};
  if (effectiveLevel < ROLE_LEVEL.photo_director) {
    // 成员只看自己
    deptQuery._id = currentUser._id;
  } else if (effectiveLevel < ROLE_LEVEL.center_director) {
    deptQuery.department = currentUser.department;
  } else if (event.department) {
    deptQuery.department = event.department;
  }

  const usersCollection = db.collection('users');
  const { data: scopeUsers } = await usersCollection
    .where(deptQuery)
    .field({ _id: true, name: true, department: true })
    .limit(1000)
    .get();

  const scopeIds = scopeUsers.map(u => u._id);
  const metaMap = {};
  scopeUsers.forEach(u => { metaMap[u._id] = { name: u.name, department: u.department }; });

  if (scopeIds.length === 0) {
    return { summary: emptySummary(), detailList: [] };
  }

  // 2. 拉取时间范围内的任务
  const range = getDateRange(event);
  const tasksQuery = {};
  if (range) {
    tasksQuery.createdAt = _.gte(range.start).and(_.lte(range.end));
  }

  const tasksCollection = db.collection('tasks');
  const { data: tasks } = await tasksCollection
    .where(tasksQuery)
    .field({
      _id: true, title: true, status: true, startTime: true, endTime: true, assignedTo: true
    })
    .limit(1000)
    .get();

  // 3. 聚合
  const stats = {};
  scopeIds.forEach(id => {
    stats[id] = { total: 0, completed: 0, hours: 0, tasks: [] };
  });

  tasks.forEach(t => {
    const assigned = (t.assignedTo || []).filter(id => scopeIds.includes(id));
    assigned.forEach(uid => {
      const s = stats[uid];
      s.total += 1;
      if (t.status === 'completed') s.completed += 1;
      if (t.startTime && t.endTime) {
        const h = (new Date(t.endTime) - new Date(t.startTime)) / 3600000;
        if (h > 0 && h < 24 * 30) s.hours += h; // 过滤异常值
      }
      if (s.tasks.length < 5) {
        s.tasks.push({ _id: t._id, title: t.title, date: formatDate(t.startTime) });
      }
    });
  });

  // 4. 组装明细
  const detailList = scopeIds.map(uid => {
    const s = stats[uid];
    const rate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    return {
      _id: uid,
      name: metaMap[uid].name,
      department: metaMap[uid].department,
      total: s.total,
      completed: s.completed,
      rate,
      tasks: s.tasks
    };
  }).sort((a, b) => b.total - a.total);

  // 5. 汇总
  const totalTasks = detailList.reduce((acc, d) => acc + d.total, 0);
  const completedTasks = detailList.reduce((acc, d) => acc + d.completed, 0);
  const totalHours = Math.round(detailList.reduce((acc, d) => acc + stats[d._id].hours, 0));
  const memberCount = scopeIds.length;
  const avgPerPerson = memberCount > 0 ? Math.round((totalTasks / memberCount) * 10) / 10 : 0;

  return {
    summary: {
      totalTasks,
      completedTasks,
      totalHours,
      avgPerPerson,
      memberCount
    },
    detailList
  };
}

function emptySummary() {
  return { totalTasks: 0, completedTasks: 0, totalHours: 0, avgPerPerson: 0, memberCount: 0 };
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const usersCollection = db.collection('users');
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在，请先登录');
    }
    const currentUser = users[0];

    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    if (
      TEST_CONFIG.enabled &&
      TEST_CONFIG.allowDebugRoleOverride &&
      event.debugMode &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[event.debugRole];
    }

    const report = await computeReport(event, currentUser, effectiveLevel);
    return Response.ok(report, '统计成功');
  } catch (err) {
    console.error('[getReport] 错误:', err);
    return Response.paramError(err.message || '统计失败');
  }
};

// 注意：不能写成 `module.exports = {...}`，否则会覆盖上面的 `exports.main`，
// 导致 CloudBase 调用入口 main 丢失。这里追加导出而非整体替换。
exports.computeReport = computeReport;
exports.getDateRange = getDateRange;
