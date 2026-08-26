/**
 * getNewsCache 云函数单元测试
 * 运行：node tests/getNewsCache.test.js
 * 覆盖：无缓存 / 有效期内缓存 / 过期缓存（>24h）/ 缺失 OPENID
 */
const assert = require('assert');
const { installMock, getMockDb, seed, setWXContext } = require('./_mockCloudSdk.js');

installMock();
const getNewsCache = require('../cloudfunctions/getNewsCache/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-97 无缓存 → 空列表
  await test('TC-97 无缓存返回空列表', async () => {
    seed({ news_cache: [] });
    const res = await getNewsCache({ taskId: 'manual' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.newsList.length, 0);
    assert.strictEqual(res.data.cachedAt, null);
  });

  // TC-98 有效期内（<24h）→ 返回缓存内容
  await test('TC-98 有效期内缓存正常返回', async () => {
    seed({
      news_cache: [{
        _id: 'c1', taskId: 'manual', keyword: '摄影',
        newsList: [{ title: 'A', url: 'https://a', matchScore: 0.9 }],
        cachedAt: new Date(Date.now() - 60 * 60 * 1000) // 1h 前
      }]
    });
    const res = await getNewsCache({ taskId: 'manual' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.newsList.length, 1);
    assert.strictEqual(res.data.newsList[0].title, 'A');
    assert.ok(res.data.cachedAt, '应返回 cachedAt');
    assert.strictEqual(res.data.expired, undefined, '不应标记过期');
  });

  // TC-99 过期（>24h）→ 返回空且标记 expired
  await test('TC-99 过期缓存返回空并标记 expired', async () => {
    seed({
      news_cache: [{
        _id: 'c2', taskId: 'manual', keyword: '摄影',
        newsList: [{ title: 'B', url: 'https://b', matchScore: 0.5 }],
        cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25h 前
      }]
    });
    const res = await getNewsCache({ taskId: 'manual' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.newsList.length, 0, '过期应返回空');
    assert.strictEqual(res.data.expired, true, '应标记过期');
  });

  // TC-100 缺失 OPENID → 参数错误
  await test('TC-100 缺失 OPENID 返回参数错误', async () => {
    setWXContext({ OPENID: '' });
    const res = await getNewsCache({ taskId: 'manual' });
    assert.strictEqual(res.code, 1, '应参数错误');
    setWXContext({ OPENID: 'test-openid' });
  });

  console.log('\ngetNewsCache 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
