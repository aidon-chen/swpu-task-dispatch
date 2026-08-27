/**
 * 生成/清理测试数据云函数（测试工具中心）
 *
 * action:
 *  - generate_users: 批量创建测试用户（openid 为 seed-openid-N 占位，按 openid 幂等跳过）
 *  - generate:       确保测试用户存在（缺则补默认一批）→ 批量创建测试任务（指派真实测试用户 _id）
 *  - clean:          删除全部 testSeed:true 的 tasks 与 users（真实数据不受影响）
 *
 * 安全：generate_users / generate / clean 三动作统一受 testConfig.enabled 门禁（默认 false）。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_CONFIG = require('./testConfig');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message })
};

const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const TYPES = ['摄影报道', '视频剪辑', '新闻摄影', '采访跟拍', '后期制作'];
const DEPARTMENTS = ['photography', 'video'];
const PRIORITIES = ['normal', 'urgent'];
const MAX_COUNT = 50;
const DEFAULT_COUNT = 12;
const MAX_USER_COUNT = 20;
const DEFAULT_USER_COUNT = 6;

/**
 * 计算当前学期（users.semester 格式：YYYY-spring / YYYY-autumn）
 * 规则：2-6 月 → 当年 spring；9-12 月 → 当年 autumn；1 月/7-8 月 → 上一年 autumn
 */
function getCurrentSemester(now) {
  const d = now || new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  if (m >= 2 && m <= 6) return `${y}-spring`;
  if (m >= 9) return `${y}-autumn`;
  return `${y - 1}-autumn`;
}

/**
 * 构造测试用户（纯函数，便于单测）
 * openid 用 seed-openid-N 占位，与真实微信 openid 不冲突；全部 member 角色
 */
function buildSeedUsers(count) {
  const n = Math.min(MAX_USER_COUNT, Math.max(1, count || DEFAULT_USER_COUNT));
  const now = new Date();
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push({
      name: `测试成员${i + 1}`,
      avatar: '',
      openid: `seed-openid-${i + 1}`,
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      role: 'member',
      semester: getCurrentSemester(now),
      testSeed: true,
      createdAt: now,
      updatedAt: now
    });
  }
  return users;
}

/**
 * 构造测试任务（纯函数，便于单测）
 * 覆盖：5 状态 / 2 部门 / 2 优先级 / 5 类型 / 跨部门混合 / ±30 天跨月 / completed 带评价
 * assignedTo / creatorId / ownerDepartment 均取自传入的测试用户（真实 _id）
 */
function buildSeedTasks(count, seedUsers) {
  const n = Math.min(MAX_COUNT, Math.max(1, count || DEFAULT_COUNT));
  const now = new Date();
  const tasks = [];
  for (let i = 0; i < n; i++) {
    const type = TYPES[i % TYPES.length];
    const status = STATUSES[i % STATUSES.length];
    const seedUser = seedUsers[i % seedUsers.length];
    const dayOffset = n === 1 ? 0 : Math.round(((i / (n - 1)) * 60) - 30);
    const startTime = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + dayOffset,
      9 + (i % 8), (i * 7) % 60, 0
    );
    const endTime = new Date(startTime.getTime() + (1 + (i % 3)) * 3600 * 1000);
    const task = {
      title: `[测试] ${type}-${i + 1}`,
      type,
      startTime,
      endTime,
      location: `测试场地${(i % 3) + 1}`,
      contact: '',
      description: '测试模式自动生成，用于验证列表筛选',
      deliverables: '',
      assignedTo: [seedUser._id],
      creatorId: seedUser._id,
      status,
      priority: PRIORITIES[i % PRIORITIES.length],
      locationId: '',
      isCrossDepartment: i % 3 === 0,
      isTemplate: false,
      templateName: '',
      ownerDepartment: seedUser.department,
      semester: getCurrentSemester(now),
      testSeed: true,
      createdAt: now,
      updatedAt: now
    };
    if (status === 'completed') {
      const score = 3 + (i % 3);
      task.ratings = [{ userId: seedUser._id, score, comment: '测试评价', createdAt: now }];
      task.avgScore = score;
    }
    tasks.push(task);
  }
  return tasks;
}

/**
 * 创建测试用户（幂等：openid 已存在则跳过）
 */
async function generateUsers(count) {
  const usersCollection = db.collection('users');
  const seeds = buildSeedUsers(count);
  let inserted = 0;
  const ids = [];
  for (const seed of seeds) {
    const { total } = await usersCollection.where({ openid: seed.openid }).count();
    if (total > 0) continue;
    const { _id } = await usersCollection.add({ data: seed });
    inserted += 1;
    ids.push(_id);
  }
  return Response.ok({ inserted, ids }, `已创建 ${inserted} 个测试用户`);
}

/**
 * 确保测试用户存在：有则取用（最多 20），无则补建默认一批
 */
async function ensureTestUsers() {
  const usersCollection = db.collection('users');
  const { total } = await usersCollection.where({ testSeed: true }).count();
  if (total > 0) {
    const { data } = await usersCollection.where({ testSeed: true }).limit(20).get();
    return data;
  }
  const seeds = buildSeedUsers(DEFAULT_USER_COUNT);
  const created = [];
  for (const seed of seeds) {
    const { _id } = await usersCollection.add({ data: seed });
    created.push({ ...seed, _id });
  }
  return created;
}

/**
 * 生成测试任务（自动确保测试用户存在）
 * 将调用者也加入 assignedTo：保证当前账号（即使数据库角色为 member）能看到测试任务，
 * 否则 getTasks 按角色范围过滤后测试数据不可见
 */
async function generateTasks(count) {
  const seedUsers = await ensureTestUsers();
  const tasksCollection = db.collection('tasks');

  // 调用者（当前登录用户）若存在，追加到指派列表
  let callerId = null;
  try {
    const { OPENID } = cloud.getWXContext();
    const { data: callers } = await db.collection('users').where({ openid: OPENID }).get();
    if (callers.length > 0) callerId = callers[0]._id;
  } catch (e) {
    console.error('[generateTestData] 查询调用者失败:', e);
  }

  const seeds = buildSeedTasks(count, seedUsers);
  let inserted = 0;
  const ids = [];
  for (const seed of seeds) {
    if (callerId && !seed.assignedTo.includes(callerId)) {
      seed.assignedTo = [callerId, ...seed.assignedTo];
    }
    const { _id } = await tasksCollection.add({ data: seed });
    inserted += 1;
    ids.push(_id);
  }
  return Response.ok(
    { inserted, ids, users: seedUsers.map(u => ({ _id: u._id, name: u.name })) },
    `已创建 ${inserted} 个测试任务`
  );
}

/**
 * 清理测试数据：删除全部 testSeed:true 的 tasks 与 users
 */
async function cleanTestData() {
  let removedTasks = 0;
  let removedUsers = 0;

  const { data: tasks } = await db.collection('tasks')
    .where({ testSeed: true }).field({ _id: true }).limit(500).get();
  for (const t of tasks) {
    await db.collection('tasks').doc(t._id).remove();
    removedTasks += 1;
  }

  const { data: users } = await db.collection('users')
    .where({ testSeed: true }).field({ _id: true }).limit(500).get();
  for (const u of users) {
    await db.collection('users').doc(u._id).remove();
    removedUsers += 1;
  }

  return Response.ok({ removedTasks, removedUsers }, `已清理 ${removedTasks} 个测试任务、${removedUsers} 个测试用户`);
}

/**
 * 给当前登录用户打「调试员」标记（isDebugUser: true，保留原角色）
 * 调试员可独占测试入口、扮演任意角色；幂等（已标记则返回 existing）
 */
async function generateDebugUser() {
  const usersCollection = db.collection('users');
  const { OPENID } = cloud.getWXContext();
  const { data: users } = await usersCollection.where({ openid: OPENID }).limit(1).get();
  if (users.length === 0) {
    return Response.paramError('当前用户不存在，请先登录');
  }
  const user = users[0];
  if (user.isDebugUser === true) {
    return Response.ok({ existing: true, user }, '当前账号已是调试员');
  }
  await usersCollection.doc(user._id).update({ data: { isDebugUser: true } });
  return Response.ok({ existing: false, user: { ...user, isDebugUser: true } }, '已将当前账号标记为调试员');
}

exports.main = async (event) => {
  // 门禁：动作统一受控
  if (!TEST_CONFIG.enabled) {
    return Response.permissionDenied('测试模式未开启，禁止操作测试数据');
  }

  const { action, count } = event || {};
  try {
    if (action === 'generate_users') {
      return await generateUsers(count);
    }
    if (action === 'generate') {
      return await generateTasks(count);
    }
    if (action === 'clean') {
      return await cleanTestData();
    }
    if (action === 'generate_debug_user') {
      return await generateDebugUser();
    }
    return Response.paramError('action 必须为 generate_users / generate / clean / generate_debug_user');
  } catch (err) {
    console.error('[generateTestData] 错误:', err);
    return Response.paramError(err.message || '操作失败');
  }
};

// 注意：追加导出，严禁写成 module.exports = {...}（会覆盖 exports.main，项目踩过此坑）
exports.buildSeedUsers = buildSeedUsers;
exports.buildSeedTasks = buildSeedTasks;
exports.getCurrentSemester = getCurrentSemester;
exports.generateDebugUser = generateDebugUser;
