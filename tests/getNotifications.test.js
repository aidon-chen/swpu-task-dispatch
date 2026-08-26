/**
 * getNotifications 云函数单元测试（消息中心列表 / 未读计数 / 分页）
 * 运行：node tests/getNotifications.test.js
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const getNotifications = require('../cloudfunctions/getNotifications/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-75 仅返回当前用户、total 与 unreadCount 正确
  await test('TC-75 隔离用户且计数正确', async () => {
    seed({
      users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }],
      notifications: [
        { _id: 'a', userId: 'u1', isRead: false, content: 'x', createdAt: new Date(1) },
        { _id: 'b', userId: 'u1', isRead: false, content: 'y', createdAt: new Date(2) },
        { _id: 'c', userId: 'u1', isRead: true, content: 'z', createdAt: new Date(3) },
        { _id: 'd', userId: 'u2', isRead: false, content: 'other', createdAt: new Date(4) }
      ]
    });
    const res = await getNotifications({});
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.total, 3, 'total 应为 3（仅 u1）');
    assert.strictEqual(res.data.unreadCount, 2, '未读应为 2');
    assert.strictEqual(res.data.list.length, 3);
    assert.ok(res.data.list.every((n) => n._id !== 'd'), '不应含 u2 通知');
  });

  // TC-76 分页
  await test('TC-76 分页正确', async () => {
    const notis = [];
    for (let i = 0; i < 25; i++) {
      notis.push({ _id: 'n' + i, userId: 'u1', isRead: false, content: 'c' + i, createdAt: new Date(i + 1) });
    }
    seed({ users: [{ _id: 'u1', openid: 'test-openid', role: 'member' }], notifications: notis });
    const p1 = await getNotifications({ page: 1, pageSize: 20 });
    assert.strictEqual(p1.data.list.length, 20, '第一页 20 条');
    assert.strictEqual(p1.data.hasMore, true, '应有下一页');
    const p2 = await getNotifications({ page: 2, pageSize: 20 });
    assert.strictEqual(p2.data.list.length, 5, '第二页 5 条');
    assert.strictEqual(p2.data.hasMore, false, '应为最后一页');
  });

  // TC-77 用户不存在 → 权限不足
  await test('TC-77 用户不存在返回权限不足', async () => {
    seed({ users: [], notifications: [] });
    const res = await getNotifications({});
    assert.strictEqual(res.code, 2);
  });

  console.log('\ngetNotifications 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
