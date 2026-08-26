/**
 * getTemplates 云函数单元测试（M8 模板可见性）
 * 运行：node tests/getTemplates.test.js
 * 覆盖：部门主任只看本部+跨部门；中心主任看全部；模板不混入普通任务
 */
const assert = require('assert');
const { installMock, getMockDb, seed, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');

installMock();
const getTemplates = require('../cloudfunctions/getTemplates/index.js').main;
const db = getMockDb();

function ctx(role) { return { debugMode: true, debugRole: role }; }

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  const tasks = [
    { _id: 't1', isTemplate: true, ownerDepartment: 'photography', isCrossDepartment: false, title: '本部模板', createdAt: 1 },
    { _id: 't2', isTemplate: true, ownerDepartment: 'video', isCrossDepartment: true, title: '跨部门模板', createdAt: 2 },
    { _id: 't3', isTemplate: true, ownerDepartment: 'video', isCrossDepartment: false, title: '他部模板', createdAt: 3 },
    { _id: 't4', isTemplate: false, ownerDepartment: 'photography', title: '普通任务', createdAt: 4 }
  ];

  // TC-06 摄影部主任：看见 t1(本部) + t2(跨部门)，看不见 t3(他部非跨) 与 t4(普通任务)
  await test('TC-06 部门主任可见性正确', async () => {
    seed({
      users: [{ _id: 'u', openid: 'test-openid', role: 'photo_director', department: 'photography' }],
      tasks
    });
    const res = await getTemplates(ctx('photo_director'));
    assert.strictEqual(res.code, 0);
    const ids = res.data.templates.map((t) => t._id).sort();
    assert.deepStrictEqual(ids, ['t1', 't2'], '应只见本部+跨部门模板');
  });

  // TC-07 中心主任：看见全部模板（t1,t2,t3），不含普通任务 t4
  await test('TC-07 中心主任可见全部模板', async () => {
    seed({
      users: [{ _id: 'u', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks
    });
    const res = await getTemplates(ctx('center_director'));
    assert.strictEqual(res.code, 0);
    const ids = res.data.templates.map((t) => t._id).sort();
    assert.deepStrictEqual(ids, ['t1', 't2', 't3'], '主任看全部模板，不含普通任务');
  });

  // TC-08 普通成员：无权查看
  await test('TC-08 普通成员被拒', async () => {
    seed({
      users: [{ _id: 'u', openid: 'test-openid', role: 'member', department: '' }]
    });
    const res = await getTemplates(ctx('member'));
    assert.strictEqual(res.code, 2, '应权限不足');
  });

  console.log('\ngetTemplates 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
