/**
 * exportReport 云函数单元测试
 * 运行：node tests/exportReport.test.js
 * 覆盖：文本报表生成（含汇总）/ 统计范围标签（仅自己·本部门）/ 用户不存在 / 月份周期标签
 * 说明：exportReport 复用 getReport，harness 将 callFunction({name:'getReport'}) 路由到真实逻辑。
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const exportReport = require('../cloudfunctions/exportReport/index.js').main;

const TASKS = [
  { _id: 't1', assignedTo: ['u_member'], status: 'completed', createdAt: '2026-07-10', startTime: '2026-07-10T09:00:00', endTime: '2026-07-10T12:00:00' },
  { _id: 't2', assignedTo: ['u_member', 'u_other'], status: 'ongoing', createdAt: '2026-07-12', startTime: '2026-07-12T09:00:00', endTime: '2026-07-12T11:00:00' }
];
const PERIOD = { period: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' };

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-107 成员生成文本报表，含汇总信息
  await test('TC-107 成员导出文本报表含汇总', async () => {
    seed({
      users: [{ _id: 'u_member', openid: 'test-openid', name: '张三', department: 'photography', role: 'member' }],
      tasks: TASKS.slice()
    });
    const res = await exportReport({ ...PERIOD });
    assert.strictEqual(res.code, 0);
    assert.ok(res.data.text.includes('【任务派发统计报表】'), '应有标题');
    assert.ok(res.data.text.includes('总任务数'), '应有总任务数');
    assert.ok(res.data.text.includes('参与人数'), '应有参与人数');
    assert.ok(res.data.text.includes('张三'), '明细应含本人');
  });

  // TC-108 统计范围标签：成员→仅自己
  await test('TC-108a 范围标签-仅自己', async () => {
    seed({
      users: [{ _id: 'u_member', openid: 'test-openid', name: '张三', department: 'photography', role: 'member' }],
      tasks: TASKS.slice()
    });
    const res = await exportReport({ ...PERIOD });
    assert.ok(res.data.text.includes('统计范围：仅自己'), '成员应为仅自己');
  });

  // TC-108 统计范围标签：摄影部主任→本部门
  await test('TC-108b 范围标签-本部门', async () => {
    seed({
      users: [{ _id: 'u_dir', openid: 'test-openid', name: '王五', department: 'photography', role: 'photo_director' }],
      tasks: TASKS.slice()
    });
    const res = await exportReport({ ...PERIOD });
    assert.ok(res.data.text.includes('统计范围：摄影部（本部门）'), '主任应为本部门');
  });

  // TC-109 用户不存在 → notFound
  await test('TC-109 用户不存在返回 notFound', async () => {
    seed({
      users: [{ _id: 'x', openid: 'someone-else', name: 'n', department: 'photography', role: 'member' }],
      tasks: TASKS.slice()
    });
    const res = await exportReport({ ...PERIOD });
    assert.strictEqual(res.code, 3, '应 notFound');
  });

  // TC-110 月份周期标签
  await test('TC-110 月份周期标签', async () => {
    seed({
      users: [{ _id: 'u_member', openid: 'test-openid', name: '张三', department: 'photography', role: 'member' }],
      tasks: TASKS.slice()
    });
    const res = await exportReport({ period: 'month', year: 2026, month: 7 });
    assert.strictEqual(res.code, 0);
    assert.ok(res.data.text.includes('统计周期：2026年7月'), '月份标签应为 2026年7月');
  });

  console.log('\nexportReport 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
