/**
 * scheduleNotify 云函数单元测试（定时扫描：提醒 + 自动完结）
 * 运行：node tests/scheduleNotify.test.js
 * 说明：函数内部以「当前时间」为基准，测试用相对当前的偏移量构造种子数据，
 *       从而稳定覆盖「开始前 2 小时提醒」「过期自动完结」「幂等防重」三条核心规则。
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const scheduleNotify = require('../cloudfunctions/scheduleNotify/index.js').main;
const db = getMockDb();

const MIN = 60 * 1000;

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  const now = Date.now();
  const tasks = [
    // A: 30 分钟后开始 → 落在 [now-5m, now+2h] 窗口，应提醒
    { _id: 'a', status: 'confirmed', startTime: new Date(now + 30 * MIN), assignedTo: ['u1'], title: '即将开始任务' },
    // B: 3 小时后开始 → 超出 2h 窗口，不提醒
    { _id: 'b', status: 'confirmed', startTime: new Date(now + 3 * 60 * MIN), assignedTo: ['u2'], title: '未来任务' },
    // C: 窗口内但已通知过 → 幂等，不重复提醒
    { _id: 'c', status: 'confirmed', startTime: new Date(now + 10 * MIN), assignedTo: ['u3'], title: '已提醒任务', notifiedAt: new Date() },
    // D: 已过期且进行中 → 自动完结 + 完成通知
    { _id: 'd', status: 'in_progress', endTime: new Date(now - 60 * MIN), assignedTo: ['u4'], title: '过期任务' },
    // E: 未过期进行中 → 不动
    { _id: 'e', status: 'in_progress', endTime: new Date(now + 60 * MIN), assignedTo: ['u5'], title: '进行中任务' }
  ];
  seed({ tasks, notifications: [] });

  const res = await scheduleNotify({});
  assert.strictEqual(res.code, 0, '应成功');

  // TC-25 提醒窗口：仅 A 收到 reminder
  await test('TC-25 仅窗口内未通知任务收到提醒', () => {
    assert.strictEqual(res.data.reminded, 1, '应提醒 1 人');
    const notis = db._collections.notifications;
    assert.strictEqual(notis.length, 2, '共 2 条通知（1 提醒 + 1 完成）');
    const reminder = notis.find((n) => n.taskId === 'a' && n.type === 'reminder');
    assert.ok(reminder, 'A 应有 reminder');
    assert.strictEqual(reminder.userId, 'u1');
    assert.strictEqual(db._collections.tasks.find((t) => t._id === 'a').notifiedAt != null, true, 'A 应标记已通知');
  });

  // TC-26 幂等：C 已通知，不重复
  await test('TC-26 已通知任务不重复提醒', () => {
    const dup = db._collections.notifications.filter((n) => n.taskId === 'c');
    assert.strictEqual(dup.length, 0, 'C 不应有通知');
  });

  // TC-27 窗口外：B 不提醒
  await test('TC-27 窗口外任务不提醒', () => {
    const bNoti = db._collections.notifications.filter((n) => n.taskId === 'b');
    assert.strictEqual(bNoti.length, 0, 'B 不应有通知');
  });

  // TC-28 自动完结：D 置 completed 并通知
  await test('TC-28 过期任务自动完结并通知', () => {
    assert.strictEqual(res.data.autoCompleted, 1, '应自动完结 1 个');
    assert.strictEqual(db._collections.tasks.find((t) => t._id === 'd').status, 'completed', 'D 应变为 completed');
    const done = db._collections.notifications.find((n) => n.taskId === 'd' && n.type === 'task_completed');
    assert.ok(done, 'D 应有完成通知');
    assert.strictEqual(done.userId, 'u4');
  });

  // TC-29 未过期进行中任务不受影响
  await test('TC-29 未过期任务保持原状', () => {
    assert.strictEqual(db._collections.tasks.find((t) => t._id === 'e').status, 'in_progress', 'E 应仍 in_progress');
    const eNoti = db._collections.notifications.filter((n) => n.taskId === 'e');
    assert.strictEqual(eNoti.length, 0, 'E 不应有通知');
  });

  console.log('\nscheduleNotify 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
