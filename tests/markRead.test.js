/**
 * markRead 云函数单元测试（标记已读）
 * 运行：node tests/markRead.test.js
 * 覆盖：标记指定 ids、标记全部、缺参报错、用户不存在
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const markRead = require('../cloudfunctions/markRead/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-78 标记指定 ids → 仅这些变为已读
  await test('TC-78 标记指定通知', async () => {
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }],
      notifications: [
        { _id: 'n1', userId: 'u1', isRead: false },
        { _id: 'n2', userId: 'u1', isRead: false },
        { _id: 'n3', userId: 'u1', isRead: false }
      ]
    });
    const res = await markRead({ ids: ['n1', 'n2'] });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.updated, 2, '应更新 2 条');
    const find = (id) => db._collections.notifications.find((n) => n._id === id);
    assert.strictEqual(find('n1').isRead, true);
    assert.strictEqual(find('n2').isRead, true);
    assert.strictEqual(find('n3').isRead, false, 'n3 应保持未读');
  });

  // TC-79 标记全部 → 全部未读变已读
  await test('TC-79 标记全部已读', async () => {
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }],
      notifications: [
        { _id: 'n1', userId: 'u1', isRead: false },
        { _id: 'n2', userId: 'u1', isRead: false }
      ]
    });
    const res = await markRead({ all: true });
    assert.strictEqual(res.data.updated, 2);
    assert.ok(db._collections.notifications.every((n) => n.isRead === true));
  });

  // TC-80 缺 ids 且非 all → 参数错误
  await test('TC-80 缺参数报错', async () => {
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], notifications: [] });
    const res = await markRead({});
    assert.strictEqual(res.code, 1);
  });

  // TC-81 用户不存在 → 权限不足
  await test('TC-81 用户不存在返回权限不足', async () => {
    seed({ users: [], notifications: [] });
    const res = await markRead({ all: true });
    assert.strictEqual(res.code, 2);
  });

  console.log('\nmarkRead 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
