/**
 * updateTask 云函数单元测试（状态机 / 越权防护 / 取消通知）
 * 运行：node tests/updateTask.test.js
 * 覆盖：主任改字段、成员仅改自己状态、成员改详情被拒、取消触发通知、不存在任务、无权限
 */
const assert = require('assert');
const { installMock, getMockDb, seed, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');

installMock();
const updateTask = require('../cloudfunctions/updateTask/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-32 中心主任：可改字段 + 状态
  await test('TC-32 主任更新标题与状态', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director' }],
      tasks: [{ _id: 't1', creatorId: 'other', assignedTo: ['u9'], title: '旧', status: 'pending' }]
    });
    const res = await updateTask({ taskId: 't1', updates: { title: '新标题', status: 'confirmed' } });
    assert.strictEqual(res.code, 0, '应成功');
    const t = db._collections.tasks.find((x) => x._id === 't1');
    assert.strictEqual(t.title, '新标题', '标题应更新');
    assert.strictEqual(t.status, 'confirmed', '状态应更新');
    assert.ok(t.updatedAt, 'updatedAt 应写入');
  });

  // TC-33 普通成员：仅改自己被指派任务的状态，允许
  await test('TC-33 成员可改自己任务的状态', async () => {
    seed({
      users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member' }],
      tasks: [{ _id: 't2', creatorId: 'other', assignedTo: ['u-mem'], status: 'pending' }]
    });
    const res = await updateTask({ taskId: 't2', updates: { status: 'confirmed' } });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(db._collections.tasks.find((x) => x._id === 't2').status, 'confirmed');
  });

  // TC-34 普通成员：改非状态字段（详情）→ 权限不足
  await test('TC-34 成员改详情被拒', async () => {
    seed({
      users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member' }],
      tasks: [{ _id: 't3', creatorId: 'other', assignedTo: ['u-mem'], status: 'pending', title: '旧' }]
    });
    const res = await updateTask({ taskId: 't3', updates: { title: '我想改名' } });
    assert.strictEqual(res.code, 2, '应权限不足');
    assert.strictEqual(db._collections.tasks.find((x) => x._id === 't3').title, '旧', '标题不应变');
  });

  // TC-35 取消任务：触发 task_cancelled 通知给所有被指派者
  await test('TC-35 取消任务触发通知', async () => {
    clearCallLog();
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director' }],
      tasks: [{ _id: 't4', creatorId: 'u-dir', assignedTo: ['u1', 'u2'], status: 'confirmed', title: '拍摄' }]
    });
    const res = await updateTask({ taskId: 't4', updates: { status: 'cancelled' } });
    assert.strictEqual(res.code, 0);
    const calls = getCallLog().filter((c) => c.name === 'sendNotification');
    assert.strictEqual(calls.length, 1, '应调用一次 sendNotification');
    assert.strictEqual(calls[0].data.type, 'task_cancelled');
    assert.deepStrictEqual(calls[0].data.userIds, ['u1', 'u2']);
    assert.strictEqual(db._collections.tasks.find((x) => x._id === 't4').status, 'cancelled');
  });

  // TC-36 任务不存在 → notFound
  await test('TC-36 任务不存在返回 notFound', async () => {
    seed({ users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director' }], tasks: [] });
    const res = await updateTask({ taskId: 'nope', updates: { status: 'confirmed' } });
    assert.strictEqual(res.code, 3, '应 notFound');
  });

  // TC-37 无权限者（非主任/非创建者/非指派者）改状态被拒
  await test('TC-37 无关人员改状态被拒', async () => {
    seed({
      users: [{ _id: 'u-stranger', openid: 'test-openid', role: 'member' }],
      tasks: [{ _id: 't5', creatorId: 'other', assignedTo: ['u-x'], status: 'pending' }]
    });
    const res = await updateTask({ taskId: 't5', updates: { status: 'confirmed' } });
    assert.strictEqual(res.code, 2, '应权限不足');
  });

  console.log('\nupdateTask 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
