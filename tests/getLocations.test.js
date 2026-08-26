/**
 * getLocations 云函数单元测试（机位列表/详情/标签过滤）
 * 运行：node tests/getLocations.test.js
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const getLocations = require('../cloudfunctions/getLocations/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-55 列表返回全部机位
  await test('TC-55 列表返回全部机位', async () => {
    seed({
      locations: [
        { _id: 'l1', name: 'A', createdAt: new Date(1) },
        { _id: 'l2', name: 'B', createdAt: new Date(2) }
      ]
    });
    const res = await getLocations({});
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.locations.length, 2);
  });

  // TC-56 标签过滤（精确匹配）
  await test('TC-56 标签过滤', async () => {
    seed({
      locations: [
        { _id: 'l1', name: 'A', tags: 'indoor', createdAt: new Date(1) },
        { _id: 'l2', name: 'B', tags: 'outdoor', createdAt: new Date(2) }
      ]
    });
    const res = await getLocations({ tag: 'indoor' });
    assert.strictEqual(res.data.locations.length, 1, '应只返回 indoor');
    assert.strictEqual(res.data.locations[0]._id, 'l1');
  });

  // TC-57 单条详情
  await test('TC-57 机位详情', async () => {
    seed({ locations: [{ _id: 'l1', name: 'A', createdAt: new Date(1) }] });
    const res = await getLocations({ locationId: 'l1' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.locations.length, 1);
    assert.strictEqual(res.data.locations[0]._id, 'l1');
  });

  // TC-58 详情不存在返回空
  await test('TC-58 详情不存在返回空', async () => {
    seed({ locations: [] });
    const res = await getLocations({ locationId: 'nope' });
    assert.strictEqual(res.data.locations.length, 0);
  });

  console.log('\ngetLocations 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
