/**
 * login 云函数单元测试（首次登录建号 / 老用户 / 注册填部门 / 校验）
 * 运行：node tests/login.test.js
 * 覆盖：新用户 isNew+默认角色、老用户幂等、register 合法/缺参/非法部门
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const login = require('../cloudfunctions/login/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-38 新用户首次登录：写入 + 默认 member + semester
  await test('TC-38 新用户首次登录建号', async () => {
    seed({ users: [] });
    const res = await login({ nickName: '小明' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.isNew, true, '应 isNew');
    assert.strictEqual(db._collections.users.length, 1, '应新增一条');
    const u = db._collections.users[0];
    assert.strictEqual(u.role, 'member', '默认角色 member');
    assert.strictEqual(u.openid, 'test-openid', 'openid 绑定');
    assert.ok(typeof u.semester === 'string' && u.semester.length > 0, 'semester 应填充');
  });

  // TC-39 老用户登录：isNew=false 且不重复建号，更新昵称
  await test('TC-39 老用户登录幂等', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', name: '旧名', role: 'member' }] });
    const res = await login({ nickName: '新名' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.isNew, false, '应非新用户');
    assert.strictEqual(db._collections.users.length, 1, '不应新增');
    assert.strictEqual(db._collections.users[0].name, '新名', '昵称应更新');
  });

  // TC-40 注册：合法 department 写入用户
  await test('TC-40 注册填部门成功', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member', department: '' }] });
    const res = await login({ action: 'register', userId: 'u1', department: 'photography' });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(db._collections.users.find((u) => u._id === 'u1').department, 'photography');
  });

  // TC-41 注册缺 department → paramError
  await test('TC-41 注册缺部门报错', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }] });
    const res = await login({ action: 'register', userId: 'u1' });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // TC-42 注册非法 department → paramError
  await test('TC-42 注册非法部门报错', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }] });
    const res = await login({ action: 'register', userId: 'u1', department: 'magic' });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  console.log('\nlogin 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
