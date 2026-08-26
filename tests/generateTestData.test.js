/**
 * generateTestData 云函数单元测试（测试工具中心）
 * 运行：node tests/generateTestData.test.js
 * 覆盖：buildSeedUsers/buildSeedTasks 纯函数字段分布 / generate_users 幂等 /
 *       generate 自动补用户 / 数量钳制 / clean 只删标记 / 开关门禁 / 非法 action
 */
const assert = require('assert');
const { installMock, seed, getMockDb, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');

installMock();
const fn = require('../cloudfunctions/generateTestData/index.js').main;
const { buildSeedUsers, buildSeedTasks, getCurrentSemester } = require('../cloudfunctions/generateTestData/index.js');
const testConfig = require('../cloudfunctions/generateTestData/testConfig');

let failed = 0;
async function test(name, fnc) {
  try { await fnc(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

function on() { testConfig.enabled = true; }
function off() { testConfig.enabled = false; }

const SEED_USERS = buildSeedUsers(6);

async function run() {
  // ===== 纯函数 =====

  // TC-200 buildSeedUsers 字段
  await test('TC-200 buildSeedUsers 字段正确', async () => {
    const us = buildSeedUsers(6);
    assert.strictEqual(us.length, 6);
    assert.ok(us.every(u => u.testSeed === true), '全部带 testSeed 标记');
    assert.ok(us.every(u => u.name.startsWith('测试成员')), '名称带前缀');
    assert.strictEqual(new Set(us.map(u => u.openid)).size, 6, 'openid 唯一');
    assert.ok(us.every(u => /^seed-openid-\d+$/.test(u.openid)), 'openid 为占位格式');
    assert.ok(us.some(u => u.department === 'photography') && us.some(u => u.department === 'video'), '两部门都有');
    assert.ok(us.every(u => u.role === 'member'), '全部 member');
  });

  // TC-201 buildSeedTasks 数量与标记
  await test('TC-201 buildSeedTasks 数量与标记正确', async () => {
    const ts = buildSeedTasks(12, SEED_USERS);
    assert.strictEqual(ts.length, 12);
    assert.ok(ts.every(t => t.testSeed === true), '全部带标记');
    assert.ok(ts.every(t => t.title.startsWith('[测试]')), '标题带前缀');
    assert.ok(ts.every(t => t.isTemplate === false), '非模板');
    const seedIds = SEED_USERS.map(u => u._id);
    assert.ok(ts.every(t => seedIds.includes(t.assignedTo[0])), '指派真实测试用户 _id');
    assert.ok(ts.every(t => seedIds.includes(t.creatorId)), '创建者为测试用户');
  });

  // TC-202 状态覆盖
  await test('TC-202 状态覆盖 5 种', async () => {
    const ts = buildSeedTasks(12, SEED_USERS);
    const statuses = new Set(ts.map(t => t.status));
    assert.deepStrictEqual([...statuses].sort(), ['cancelled', 'completed', 'confirmed', 'in_progress', 'pending']);
  });

  // TC-203 部门/优先级/类型/跨部门
  await test('TC-203 字段分布覆盖', async () => {
    const ts = buildSeedTasks(12, SEED_USERS);
    assert.ok(ts.some(t => t.ownerDepartment === 'photography') && ts.some(t => t.ownerDepartment === 'video'), '两部门');
    assert.ok(ts.some(t => t.priority === 'normal') && ts.some(t => t.priority === 'urgent'), '两优先级');
    assert.strictEqual(new Set(ts.map(t => t.type)).size, 5, '5 种类型');
    assert.ok(ts.some(t => t.isCrossDepartment === true) && ts.some(t => t.isCrossDepartment === false), '跨部门有真有假');
  });

  // TC-204 时间跨月 + 评价 + 学期
  await test('TC-204 时间跨月且 completed 带评价', async () => {
    const ts = buildSeedTasks(12, SEED_USERS);
    const times = ts.map(t => t.startTime.getTime());
    const days = (Math.max(...times) - Math.min(...times)) / 86400000;
    assert.ok(days >= 30, `跨度应 ≥30 天，实际 ${Math.round(days)} 天`);
    ts.filter(t => t.status === 'completed').forEach(t => {
      assert.ok(t.ratings && t.ratings.length === 1, 'completed 带 ratings');
      assert.strictEqual(t.avgScore, t.ratings[0].score, 'avgScore 与评分一致');
    });
    assert.ok(ts.every(t => /^\d{4}-(spring|autumn)$/.test(t.semester)), '学期格式正确');
    assert.ok(/^\d{4}-(spring|autumn)$/.test(getCurrentSemester(new Date())), 'getCurrentSemester 格式正确');
  });

  // ===== generate_users =====

  // TC-205 generate_users 写库
  await test('TC-205 generate_users 写库成功', async () => {
    on();
    seed({ users: [], tasks: [] });
    clearCallLog();
    const res = await fn({ action: 'generate_users', count: 6 });
    off();
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.inserted, 6);
    const db = getMockDb();
    const { data: users } = await db.collection('users').where({ testSeed: true }).get();
    assert.strictEqual(users.length, 6, '库中 6 条测试用户');
    assert.strictEqual(new Set(users.map(u => u.openid)).size, 6, 'openid 唯一');
  });

  // TC-206 generate_users 幂等
  await test('TC-206 generate_users 幂等不重复插入', async () => {
    on();
    seed({ users: [], tasks: [] });
    await fn({ action: 'generate_users', count: 6 });
    const res2 = await fn({ action: 'generate_users', count: 6 });
    off();
    assert.strictEqual(res2.code, 0);
    assert.strictEqual(res2.data.inserted, 0, '重复执行应跳过已存在 openid');
    const db = getMockDb();
    const { data: users } = await db.collection('users').where({ testSeed: true }).get();
    assert.strictEqual(users.length, 6, '总数不变');
  });

  // ===== generate =====

  // TC-207 generate 自动补用户 + 写库
  await test('TC-207 generate 自动补测试用户并写库', async () => {
    on();
    seed({ users: [], tasks: [] });
    clearCallLog();
    const res = await fn({ action: 'generate', count: 12 });
    off();
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.inserted, 12);
    assert.ok(res.data.users.length >= 1, '返回测试用户信息');
    const db = getMockDb();
    const { data: users } = await db.collection('users').where({ testSeed: true }).get();
    assert.ok(users.length >= 1, 'users 库自动补建测试用户');
    const { data: tasks } = await db.collection('tasks').where({ testSeed: true }).get();
    assert.strictEqual(tasks.length, 12);
    const uid = res.data.users[0]._id;
    assert.ok(tasks.every(t => t.assignedTo.includes(uid) || users.some(u => u._id === t.assignedTo[0])), '指派真实用户');
    assert.strictEqual(getCallLog().length, 0, '不应触发任何通知');
  });

  // TC-208 数量钳制
  await test('TC-208 数量钳制生效', async () => {
    on();
    seed({ users: [], tasks: [] });
    const r1 = await fn({ action: 'generate', count: 100 });
    const r2 = await fn({ action: 'generate' });
    off();
    assert.strictEqual(r1.code, 0);
    assert.strictEqual(r1.data.inserted, 50, '上限 50');
    assert.strictEqual(r2.code, 0);
    assert.strictEqual(r2.data.inserted, 12, '缺省 12');
  });

  // ===== clean =====

  // TC-209 clean 只删测试数据
  await test('TC-209 clean 只删 testSeed 标记数据', async () => {
    on();
    seed({
      users: [
        { _id: 'real-user', openid: 'real-openid', name: '真实用户', role: 'member' },
        { _id: 'seed-u1', openid: 'seed-openid-1', name: '测试成员1', testSeed: true },
        { _id: 'seed-u2', openid: 'seed-openid-2', name: '测试成员2', testSeed: true }
      ],
      tasks: [
        { _id: 'real-task', title: '真实任务', testSeed: undefined },
        { _id: 'seed-t1', title: '[测试] 摄影报道-1', testSeed: true },
        { _id: 'seed-t2', title: '[测试] 视频剪辑-2', testSeed: true }
      ]
    });
    const res = await fn({ action: 'clean' });
    off();
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.removedTasks, 2);
    assert.strictEqual(res.data.removedUsers, 2);
    const db = getMockDb();
    const { data: tasks } = await db.collection('tasks').get();
    assert.deepStrictEqual(tasks.map(t => t._id), ['real-task'], '真实任务保留');
    const { data: users } = await db.collection('users').get();
    assert.deepStrictEqual(users.map(u => u._id), ['real-user'], '真实用户保留');
  });

  // ===== 门禁与参数 =====

  // TC-210 开关门禁
  await test('TC-210 开关关闭时三动作均被拒', async () => {
    off();
    seed({ users: [{ _id: 'u1', openid: 'real-openid', name: 'n', testSeed: undefined }], tasks: [{ _id: 't1', title: 't', testSeed: undefined }] });
    const r1 = await fn({ action: 'generate_users' });
    const r2 = await fn({ action: 'generate' });
    const r3 = await fn({ action: 'clean' });
    assert.strictEqual(r1.code, 2);
    assert.strictEqual(r2.code, 2);
    assert.strictEqual(r3.code, 2);
    const db = getMockDb();
    const { data: users } = await db.collection('users').get();
    const { data: tasks } = await db.collection('tasks').get();
    assert.strictEqual(users.length, 1, '数据未被改动');
    assert.strictEqual(tasks.length, 1, '数据未被改动');
  });

  // TC-211 非法 action
  await test('TC-211 非法 action 返回 paramError', async () => {
    on();
    seed({ users: [], tasks: [] });
    const res = await fn({ action: 'foo' });
    off();
    assert.strictEqual(res.code, 1);
  });

  // TC-212 生成任务时追加调用者到 assignedTo（保证当前账号可见测试数据）
  await test('TC-212 调用者被追加到指派列表', async () => {
    on();
    seed({
      users: [{ _id: 'caller-1', openid: 'test-openid', name: '调用者', role: 'member', testSeed: undefined }],
      tasks: []
    });
    const res = await fn({ action: 'generate', count: 5 });
    off();
    assert.strictEqual(res.code, 0);
    const db = getMockDb();
    const { data: tasks } = await db.collection('tasks').where({ testSeed: true }).get();
    assert.ok(tasks.every(t => t.assignedTo.includes('caller-1')), '每个任务都应含调用者 _id');
    assert.ok(tasks.every(t => t.assignedTo.length >= 2), 'seed 用户 + 调用者');
  });

  console.log('\ngenerateTestData 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
