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

  // ===== M9 高级筛选 =====

  // TC-32 类型筛选（模糊匹配）
  await test('TC-32 类型筛选生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'a1', isTemplate: false, status: 'confirmed', type: '摄影报道', title: '摄影任务' },
        { _id: 'a2', isTemplate: false, status: 'confirmed', type: '视频剪辑', title: '视频任务' },
        { _id: 'a3', isTemplate: false, status: 'confirmed', type: '新闻摄影', title: '摄影二' }
      ]
    });
    const res = await getTasks({ type: '摄影' });
    assert.strictEqual(res.code, 0);
    const ids = res.data.tasks.map((t) => t._id).sort();
    assert.deepStrictEqual(ids, ['a1', 'a3'], '应只返回类型含"摄影"的任务');
  });

  // TC-33 部门筛选（按 ownerDepartment 精确匹配）
  await test('TC-33 部门筛选生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'b1', isTemplate: false, status: 'confirmed', ownerDepartment: 'photography', title: '摄影部任务' },
        { _id: 'b2', isTemplate: false, status: 'confirmed', ownerDepartment: 'video', title: '视频部任务' }
      ]
    });
    const res = await getTasks({ department: 'photography' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks.length, 1);
    assert.strictEqual(res.data.tasks[0]._id, 'b1');
  });

  // TC-34 时间区间筛选（startTime 在 [startDate, endDate]）
  await test('TC-34 时间区间筛选生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'c1', isTemplate: false, status: 'confirmed', startTime: '2026-07-10T09:00:00', title: '区间内' },
        { _id: 'c2', isTemplate: false, status: 'confirmed', startTime: '2026-08-01T09:00:00', title: '区间外' }
      ]
    });
    const res = await getTasks({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks.length, 1);
    assert.strictEqual(res.data.tasks[0]._id, 'c1');
  });

  // TC-35 组合筛选（status + type + department）
  await test('TC-35 组合筛选生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'd1', isTemplate: false, status: 'completed', type: '摄影', ownerDepartment: 'photography', title: '命中' },
        { _id: 'd2', isTemplate: false, status: 'pending', type: '摄影', ownerDepartment: 'photography', title: '状态不符' },
        { _id: 'd3', isTemplate: false, status: 'completed', type: '视频', ownerDepartment: 'photography', title: '类型不符' }
      ]
    });
    const res = await getTasks({ status: 'completed', type: '摄影', department: 'photography' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks.length, 1);
    assert.strictEqual(res.data.tasks[0]._id, 'd1');
  });

  // TC-36 排序：按优先级（urgent 在前）
  await test('TC-36 优先级排序生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'e1', isTemplate: false, status: 'confirmed', priority: 'normal', startTime: '2026-07-10T09:00:00', title: '普通' },
        { _id: 'e2', isTemplate: false, status: 'confirmed', priority: 'urgent', startTime: '2026-07-09T09:00:00', title: '紧急' }
      ]
    });
    const res = await getTasks({ sort: 'priority' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks[0]._id, 'e2', 'urgent 应排在 normal 前');
  });

  // TC-37 跨部门筛选
  await test('TC-37 跨部门筛选生效', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'center_director', department: '' }],
      tasks: [
        { _id: 'f1', isTemplate: false, status: 'confirmed', isCrossDepartment: true, title: '跨部门' },
        { _id: 'f2', isTemplate: false, status: 'confirmed', isCrossDepartment: false, title: '本部' }
      ]
    });
    const res = await getTasks({ isCrossDepartment: true });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.tasks.length, 1);
    assert.strictEqual(res.data.tasks[0]._id, 'f1');
  });

  console.log('\ngetTasks 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
