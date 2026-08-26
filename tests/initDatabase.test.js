/**
 * initDatabase 云函数单元测试（集合初始化幂等）
 * 运行：node tests/initDatabase.test.js
 * 覆盖：首次全量创建 / 重复运行跳过（幂等）/ 部分已存在
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const initDatabase = require('../cloudfunctions/initDatabase/index.js').main;
const db = getMockDb();

const ALL = ['users', 'keys', 'tasks', 'user_status', 'locations', 'notifications', 'duty_schedule', 'news_cache', 'duty_records'];

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-43 首次运行：创建全部 9 个集合
  await test('TC-43 首次运行创建全部集合', async () => {
    seed({}); // 空库
    const res = await initDatabase({});
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.created.length, ALL.length, '应创建 9 个');
    assert.strictEqual(res.data.skipped.length, 0, '无跳过');
    for (const name of ALL) {
      assert.ok(db._collections[name] !== undefined, `集合 ${name} 应存在`);
    }
  });

  // TC-44 重复运行：全部跳过（幂等，不报错）
  await test('TC-44 重复运行幂等', async () => {
    const res = await initDatabase({}); // 接 TC-43 状态，集合已存在
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.created.length, 0, '不应再创建');
    assert.strictEqual(res.data.skipped.length, ALL.length, '应全部跳过');
  });

  // TC-45 部分已存在：只创建缺失的
  await test('TC-45 部分已存在只补缺失', async () => {
    seed({ users: [{ _id: 'u' }], tasks: [{ _id: 't' }] }); // users/tasks 已存在
    const res = await initDatabase({});
    assert.strictEqual(res.code, 0);
    assert.deepStrictEqual(res.data.skipped.sort(), ['tasks', 'users'], '已存在的应跳过');
    assert.strictEqual(res.data.created.length, ALL.length - 2, '应只创建缺失的 6 个');
  });

  console.log('\ninitDatabase 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
