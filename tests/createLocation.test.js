/**
 * createLocation 云函数单元测试（机位增删改 + 权限）
 * 运行：node tests/createLocation.test.js
 * 覆盖：成员被拒、主任可建、调试角色信任、缺名报错、update/delete
 * 注：createLocation/testConfig.js 默认 enabled:true，调试角色信任本就开启
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const createLocation = require('../cloudfunctions/createLocation/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-49 成员无调试角色：创建被拒
  await test('TC-49 成员创建机位被拒', async () => {
    seed({ users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member' }], locations: [] });
    const res = await createLocation({ name: '图书馆机位' });
    assert.strictEqual(res.code, 2, '应权限不足');
    assert.strictEqual(db._collections.locations.length, 0);
  });

  // TC-50 部门主任：可创建，记录 createdBy
  await test('TC-50 主任创建机位成功', async () => {
    seed({ users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director' }], locations: [] });
    const res = await createLocation({ name: '会议室机位', description: '三脚架' });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(db._collections.locations.length, 1, '应写入 1 条');
    assert.strictEqual(db._collections.locations[0].createdBy, 'u-dir');
    assert.strictEqual(db._collections.locations[0].name, '会议室机位');
  });

  // TC-51 调试角色信任：成员带 debugRole=center_director 可建
  await test('TC-51 调试角色信任可越权创建', async () => {
    seed({ users: [{ _id: 'u-mem', openid: 'test-openid', role: 'member' }], locations: [] });
    const res = await createLocation({ name: '调试机位', debugMode: true, debugRole: 'center_director' });
    assert.strictEqual(res.code, 0, '调试角色应放行');
    assert.strictEqual(db._collections.locations.length, 1);
  });

  // TC-52 缺机位名称 → 参数错误
  await test('TC-52 缺名称报错', async () => {
    seed({ users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director' }], locations: [] });
    const res = await createLocation({});
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // TC-53 更新机位
  await test('TC-53 主任更新机位', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director' }],
      locations: [{ _id: 'loc1', name: '旧', createdBy: 'u-dir' }]
    });
    const res = await createLocation({ action: 'update', locationId: 'loc1', updates: { name: '新名' } });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(db._collections.locations[0].name, '新名');
  });

  // TC-54 删除机位
  await test('TC-54 主任删除机位', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director' }],
      locations: [{ _id: 'loc1', name: 'x', createdBy: 'u-dir' }]
    });
    const res = await createLocation({ action: 'delete', locationId: 'loc1' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(db._collections.locations.length, 0);
  });

  console.log('\ncreateLocation 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
