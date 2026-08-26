/**
 * updateDutySchedule 云函数单元测试（排班 upsert + 鉴权）
 * 运行：node tests/updateDutySchedule.test.js
 * 覆盖：本人可改/成员改他人被拒/主任管本部/主任不管外部门/非法状态/缺记录/调试角色信任
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const updateDutySchedule = require('../cloudfunctions/updateDutySchedule/index.js').main;
const db = getMockDb();
const cfg = require('../cloudfunctions/updateDutySchedule/testConfig.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-63 成员改自己排班 → 成功写入
  await test('TC-63 成员改自己排班成功', async () => {
    seed({ users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member', department: 'photography' }], duty_schedule: [] });
    const res = await updateDutySchedule({ userId: 'u-mem', date: '2026-07-20', status: 'busy' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.results[0].ok, true, '应成功');
    assert.strictEqual(db._collections.duty_schedule.length, 1);
  });

  // TC-64 成员改他人 → 该条权限不足（非抛错，记结果）
  await test('TC-64 成员改他人被拒', async () => {
    seed({
      users: [
        { _id: 'u-mem', openid: 'test-openid', role: 'member', department: 'photography' },
        { _id: 'u-x', role: 'member', department: 'photography' }
      ],
      duty_schedule: []
    });
    const res = await updateDutySchedule({ userId: 'u-x', date: '2026-07-20', status: 'busy' });
    assert.strictEqual(res.data.results[0].ok, false, '应失败');
    assert.ok(res.data.results[0].error.includes('权限'), '应提示权限不足');
    assert.strictEqual(db._collections.duty_schedule.length, 0);
  });

  // TC-65 部门主任改本部门成员 → 成功
  await test('TC-65 主任改本部门成员成功', async () => {
    seed({
      users: [
        { _id: 'u-dir', openid: 'test-openid', role: 'photo_director', department: 'photography' },
        { _id: 'u-p1', role: 'member', department: 'photography' }
      ],
      duty_schedule: []
    });
    const res = await updateDutySchedule({ userId: 'u-p1', date: '2026-07-20', status: 'available' });
    assert.strictEqual(res.data.results[0].ok, true);
    assert.strictEqual(db._collections.duty_schedule.length, 1);
  });

  // TC-66 部门主任改外部门成员 → 失败
  await test('TC-66 主任不管外部门成员', async () => {
    seed({
      users: [
        { _id: 'u-dir', openid: 'test-openid', role: 'photo_director', department: 'photography' },
        { _id: 'u-v1', role: 'member', department: 'video' }
      ],
      duty_schedule: []
    });
    const res = await updateDutySchedule({ userId: 'u-v1', date: '2026-07-20', status: 'available' });
    assert.strictEqual(res.data.results[0].ok, false, '应失败');
    assert.ok(res.data.results[0].error.includes('部门外'), '应提示无权管理部门外');
  });

  // TC-67 非法 status → 参数错误
  await test('TC-67 非法状态报错', async () => {
    seed({ users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member', department: 'photography' }] });
    const res = await updateDutySchedule({ userId: 'u-mem', date: '2026-07-20', status: 'flying' });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // TC-68 缺记录 → 参数错误
  await test('TC-68 缺排班记录报错', async () => {
    seed({ users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member', department: 'photography' }] });
    const res = await updateDutySchedule({});
    assert.strictEqual(res.code, 1);
  });

  // TC-69 调试角色信任：成员带 debugRole=center_director 可改他人（需开启 testConfig）
  await test('TC-69 调试角色信任可越权改他人', async () => {
    cfg.enabled = true;
    seed({
      users: [
        { _id: 'u-mem', openid: 'test-openid', role: 'member', department: 'photography' },
        { _id: 'u-x', role: 'member', department: 'video' }
      ],
      duty_schedule: []
    });
    const res = await updateDutySchedule({ userId: 'u-x', date: '2026-07-20', status: 'busy', debugMode: true, debugRole: 'center_director' });
    assert.strictEqual(res.data.results[0].ok, true, '调试角色应放行');
    cfg.enabled = false;
  });

  console.log('\nupdateDutySchedule 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
