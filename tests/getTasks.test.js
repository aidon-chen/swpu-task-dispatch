/**
 * getTasks 云函数单元测试（列表查询 / 模板隔离 / 角色范围）
 * 运行：node tests/getTasks.test.js
 * 覆盖：模板不混入普通列表（M8 回归）、取消任务默认排除、部门主任可见范围
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const getTasks = require('../cloudfunctions/getTasks/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-30 中心主任：模板与取消任务都不应出现在普通列表
  await test('TC-30 模板与取消任务被隔离', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'n1', isTemplate: false, status: 'confirmed', title: '正常任务' },
        { _id: 'tpl', isTemplate: true, status: 'confirmed', title: '模板任务' },
        { _id: 'c1', isTemplate: false, status: 'cancelled', title: '已取消任务' }
      ]
    });
    const res = await getTasks({});
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks.length, 1, '应仅 1 条普通任务');
    assert.strictEqual(res.data.tasks[0]._id, 'n1', '应只有正常任务');
    assert.ok(!res.data.tasks.some((t) => t.isTemplate), '列表不应含模板');
    assert.strictEqual(res.data.stats.confirmed, 1, '统计仅计普通任务');
  });

  // TC-31 部门主任：仅见本部创建或非跨部门任务之外的（本部 + 跨部门）
  await test('TC-31 部门主任可见范围正确', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director', department: 'photography' }],
      tasks: [
        { _id: 't1', isTemplate: false, status: 'confirmed', creatorId: 'u-dir', isCrossDepartment: false, title: '本部任务' },
        { _id: 't2', isTemplate: false, status: 'confirmed', creatorId: 'other', isCrossDepartment: true, title: '跨部门任务' },
        { _id: 't3', isTemplate: false, status: 'confirmed', creatorId: 'other', isCrossDepartment: false, title: '他部任务' },
        { _id: 'tpl', isTemplate: true, status: 'confirmed', title: '模板' }
      ]
    });
    const res = await getTasks({});
    assert.strictEqual(res.code, 0);
    const ids = res.data.tasks.map((t) => t._id).sort();
    assert.deepStrictEqual(ids, ['t1', 't2'], '应仅见本部+跨部门，不含他部与模板');
  });

  console.log('\ngetTasks 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
