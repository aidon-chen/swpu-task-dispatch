/**
 * generateKey 云函数单元测试（正式密钥生成）
 * 运行：node tests/generateKey.test.js
 * 覆盖：中心主任生成、成员被拒、非法角色/部门、数量上限、调试角色信任
 * 注：generateKey/testConfig.js 默认 enabled:false，调试信任需测试内临时开启
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const generateKey = require('../cloudfunctions/generateKey/index.js').main;
const db = getMockDb();
const cfg = require('../cloudfunctions/generateKey/testConfig.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-82 中心主任生成 1 个正式密钥
  await test('TC-82 主任生成正式密钥', async () => {
    seed({ users: [{ _id: 'u-c', openid: 'test-openid', role: 'center_director' }], keys: [] });
    const res = await generateKey({ role: 'photo_director', department: 'photography' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(db._collections.keys.length, 1, '应写入 1 条');
    const k = db._collections.keys[0];
    assert.strictEqual(k.testKey, false, '非测试密钥');
    assert.strictEqual(k.isUsed, false, '未使用');
    assert.strictEqual(k.role, 'photo_director');
  });

  // TC-83 成员生成 → 权限不足
  await test('TC-83 成员生成被拒', async () => {
    seed({ users: [{ _id: 'u-m', openid: 'test-openid', role: 'member' }], keys: [] });
    const res = await generateKey({ role: 'photo_director', department: 'photography' });
    assert.strictEqual(res.code, 2);
  });

  // TC-84 非法角色 → 参数错误
  await test('TC-84 非法角色报错', async () => {
    seed({ users: [{ _id: 'u-c', openid: 'test-openid', role: 'center_director' }], keys: [] });
    const res = await generateKey({ role: 'king' });
    assert.strictEqual(res.code, 1);
  });

  // TC-85 非 member 缺部门 → 参数错误
  await test('TC-85 缺部门报错', async () => {
    seed({ users: [{ _id: 'u-c', openid: 'test-openid', role: 'center_director' }], keys: [] });
    const res = await generateKey({ role: 'video_director' });
    assert.strictEqual(res.code, 1);
  });

  // TC-86 数量上限（count=5 正常生成 5 个）
  await test('TC-86 生成多把密钥', async () => {
    seed({ users: [{ _id: 'u-c', openid: 'test-openid', role: 'center_director' }], keys: [] });
    const res = await generateKey({ role: 'member', count: 5 });
    assert.strictEqual(res.data.keys.length, 5, '应生成 5 把');
    assert.strictEqual(db._collections.keys.length, 5);
  });

  // TC-87 调试角色信任：调试员（库角色 debug）带 debugRole=center_director 可生成（需开启 testConfig）
  await test('TC-87 调试角色信任可生成', async () => {
    cfg.enabled = true;
    seed({ users: [{ _id: 'u-m', openid: 'test-openid', role: 'debug' }], keys: [] });
    const res = await generateKey({ role: 'photo_director', department: 'photography', debugMode: true, debugRole: 'center_director' });
    assert.strictEqual(res.code, 0, '调试角色应放行');
    cfg.enabled = false;
  });

  console.log('\ngenerateKey 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
