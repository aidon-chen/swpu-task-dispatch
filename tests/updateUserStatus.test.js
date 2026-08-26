/**
 * updateUserStatus 云函数单元测试（成员状态设置）
 * 运行：node tests/updateUserStatus.test.js
 * 覆盖：合法状态写入、非法状态、缺状态、周固定时间、1 分钟去重
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const updateUserStatus = require('../cloudfunctions/updateUserStatus/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-70 合法状态 → 写入 user_status
  await test('TC-70 合法状态写入', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], user_status: [] });
    const res = await updateUserStatus({ status: 'busy', reason: '拍摄中' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(db._collections.user_status.length, 1);
    assert.strictEqual(db._collections.user_status[0].status, 'busy');
  });

  // TC-71 非法状态 → 参数错误
  await test('TC-71 非法状态报错', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], user_status: [] });
    const res = await updateUserStatus({ status: 'sleeping' });
    assert.strictEqual(res.code, 1);
  });

  // TC-72 缺状态 → 参数错误
  await test('TC-72 缺状态报错', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }] });
    const res = await updateUserStatus({});
    assert.strictEqual(res.code, 1);
  });

  // TC-73 周固定时间 → 更新用户 weeklySchedule
  await test('TC-73 周固定时间更新', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], user_status: [] });
    const res = await updateUserStatus({ weeklySchedule: [{ day: 1, slots: ['14:00-16:00'] }] });
    assert.strictEqual(res.code, 0);
    assert.ok(Array.isArray(db._collections.users[0].weeklySchedule), 'weeklySchedule 应写入');
  });

  // TC-74 1 分钟内同状态去重 → 返回 unchanged
  await test('TC-74 同状态去重', async () => {
    const now = new Date();
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }],
      user_status: [{ _id: 's0', userId: 'u1', status: 'busy', createdAt: now }]
    });
    const res = await updateUserStatus({ status: 'busy' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.unchanged, true, '应判定未变化');
  });

  console.log('\nupdateUserStatus 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
