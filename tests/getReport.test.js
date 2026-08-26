/**
 * getReport 云函数单元测试
 * 运行：node tests/getReport.test.js
 * 覆盖：成员只看自己 / 部门主任看本部门 / 中心主任看全部 /
 *       统计数值（完成率·工时·均值）/ 用户不存在 / 调试角色越权
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const getReport = require('../cloudfunctions/getReport/index.js').main;
const reportTestConfig = require('../cloudfunctions/getReport/testConfig');

const USERS = [
  { _id: 'u_member', openid: 'test-openid', name: '张三', department: 'photography', role: 'member' },
  { _id: 'u_other', openid: 'other-openid', name: '李四', department: 'video', role: 'member' },
  { _id: 'u_dir', openid: 'dir-openid', name: '王五', department: 'photography', role: 'photo_director' },
  { _id: 'u_center', openid: 'center-openid', name: '赵六', department: 'video', role: 'center_director' }
];
const TASKS = [
  { _id: 't1', assignedTo: ['u_member'], status: 'completed', createdAt: '2026-07-10', startTime: '2026-07-10T09:00:00', endTime: '2026-07-10T12:00:00' },
  { _id: 't2', assignedTo: ['u_member', 'u_other'], status: 'ongoing', createdAt: '2026-07-12', startTime: '2026-07-12T09:00:00', endTime: '2026-07-12T11:00:00' },
  { _id: 't3', assignedTo: ['u_other'], status: 'completed', createdAt: '2026-07-11', startTime: '2026-07-11T09:00:00', endTime: '2026-07-11T13:00:00' }
];
const PERIOD = { period: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' };

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-101 成员只看自己（scope 限定为本人）
  await test('TC-101 成员仅看到本人统计', async () => {
    seed({ users: USERS.slice(), tasks: TASKS.slice() });
    const res = await getReport({ ...PERIOD });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.detailList.length, 1, '成员应只看到自己');
    assert.strictEqual(res.data.detailList[0].name, '张三');
    assert.strictEqual(res.data.summary.memberCount, 1);
  });

  // TC-104 成员统计数值精确（完成率 / 工时 / 人均）
  await test('TC-104 成员统计数值正确', async () => {
    seed({ users: USERS.slice(), tasks: TASKS.slice() });
    const res = await getReport({ ...PERIOD });
    const me = res.data.detailList[0];
    assert.strictEqual(me.total, 2, '应 2 个任务（t1+t2）');
    assert.strictEqual(me.completed, 1, '应 1 个完成（t1）');
    assert.strictEqual(me.rate, 50, '完成率应为 50%');
    assert.strictEqual(res.data.summary.totalHours, 5, '总工时应为 3+2=5');
    assert.strictEqual(res.data.summary.completedTasks, 1);
    assert.strictEqual(res.data.summary.avgPerPerson, 2, '人均应为 2.0');
  });

  // TC-102 摄影部主任看到本部门（以 debugRole 覆盖验证部门范围）
  await test('TC-102 摄影部主任看到本部门(摄影部)', async () => {
    seed({ users: USERS.slice(), tasks: TASKS.slice() });
    reportTestConfig.enabled = true;
    reportTestConfig.allowDebugRoleOverride = true;
    const res = await getReport({ ...PERIOD, debugMode: true, debugRole: 'photo_director' });
    reportTestConfig.enabled = false; reportTestConfig.allowDebugRoleOverride = false;
    assert.strictEqual(res.code, 0);
    const names = res.data.detailList.map(d => d.name);
    assert.ok(names.includes('张三') && names.includes('王五'), '应包含摄影部成员');
    assert.ok(!names.includes('李四') && !names.includes('赵六'), '不应含视频部成员');
    assert.strictEqual(res.data.summary.memberCount, 2);
  });

  // TC-103 中心主任看全部
  await test('TC-103 中心主任看到全部成员', async () => {
    seed({ users: USERS.slice(), tasks: TASKS.slice() });
    reportTestConfig.enabled = true;
    reportTestConfig.allowDebugRoleOverride = true;
    const res = await getReport({ ...PERIOD, debugMode: true, debugRole: 'center_director' });
    reportTestConfig.enabled = false; reportTestConfig.allowDebugRoleOverride = false;
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.summary.memberCount, 4, '应含全部 4 人');
    assert.strictEqual(res.data.summary.totalTasks, 4, 'u_member(2)+u_other(2)');
    assert.strictEqual(res.data.summary.completedTasks, 2, 't1+t3 完成');
  });

  // TC-105 用户不存在 → notFound
  await test('TC-105 用户不存在返回 notFound', async () => {
    seed({ users: [{ _id: 'x', openid: 'someone-else', name: 'n', department: 'photography', role: 'member' }], tasks: TASKS.slice() });
    const res = await getReport({ ...PERIOD });
    assert.strictEqual(res.code, 3, '应 notFound');
  });

  // TC-106 调试角色越权（testConfig 开启时信任前端角色）
  await test('TC-106 调试角色越权生效', async () => {
    seed({ users: USERS.slice(), tasks: TASKS.slice() });
    reportTestConfig.enabled = true;
    reportTestConfig.allowDebugRoleOverride = true;
    const res = await getReport({ ...PERIOD, debugMode: true, debugRole: 'photo_director' });
    reportTestConfig.enabled = false; reportTestConfig.allowDebugRoleOverride = false;
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.detailList.length, 2, '越权为主任后应只看摄影部');
  });

  console.log('\ngetReport 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
