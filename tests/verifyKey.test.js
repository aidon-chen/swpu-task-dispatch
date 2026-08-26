/**
 * verifyKey 云函数单元测试（正式密钥角色升级路径）
 * 运行：node tests/verifyKey.test.js
 * 说明：聚焦设计文档 P0 缺口——正式密钥「角色升级」路径与边界
 *       （测试密钥的用后即焚/可复用已在 testKeyCloudFunctions.test.js 覆盖）
 * 注：verifyKey 仅更新用户 role，不传播 key.department（当前行为；如后续改需补断言）
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const verifyKey = require('../cloudfunctions/verifyKey/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-46 当前角色已 >= 密钥角色 → 拒绝，且不改角色
  await test('TC-46 角色不低于密钥则拒绝', async () => {
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'photo_director' }],
      keys: [{ _id: 'k1', key: 'PROD-LOW', role: 'member', isUsed: false }]
    });
    const res = await verifyKey({ key: 'PROD-LOW' });
    assert.strictEqual(res.code, 1, '应参数错误');
    assert.strictEqual(db._collections.users[0].role, 'photo_director', '角色不应变');
  });

  // TC-47 密钥不存在 → notFound
  await test('TC-47 密钥不存在返回 notFound', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], keys: [] });
    const res = await verifyKey({ key: 'GHOST' });
    assert.strictEqual(res.code, 3, '应 notFound');
  });

  // TC-48 正式密钥升级：role 更新、标记已用、isTestKey=false
  await test('TC-48 正式密钥角色升级成功', async () => {
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }],
      keys: [{ _id: 'k2', key: 'PROMOTE', role: 'photo_director', isUsed: false }]
    });
    const res = await verifyKey({ key: 'PROMOTE' });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.role, 'photo_director', '应升级为 photo_director');
    assert.strictEqual(res.data.isTestKey, false, '非测试密钥');
    assert.strictEqual(res.data.previousRole, 'member', '应记录原角色');
    assert.strictEqual(db._collections.users[0].role, 'photo_director', '用户角色已更新');
    assert.strictEqual(db._collections.keys[0].isUsed, true, '密钥应标记已用');
  });

  console.log('\nverifyKey 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
