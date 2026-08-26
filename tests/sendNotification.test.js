/**
 * sendNotification 云函数单元测试（通知写入）
 * 运行：node tests/sendNotification.test.js
 * 覆盖：参数校验 / 批量写入 / 自定义文案 / 单接收者归一化
 */
const assert = require('assert');
const { installMock, getMockDb, seed, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');

installMock();
const sendNotification = require('../cloudfunctions/sendNotification/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  // TC-21 缺少 userIds：参数错误
  await test('TC-21 缺少 userIds 返回参数错误', async () => {
    seed({ notifications: [] });
    const res = await sendNotification({ type: 'task_assigned', taskInfo: { title: 'x' } });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // TC-22 数组接收者：写入 N 条，返回 written=N
  await test('TC-22 数组接收者批量写入', async () => {
    seed({ notifications: [] });
    const res = await sendNotification({
      type: 'task_assigned',
      userIds: ['u1', 'u2', 'u3'],
      taskInfo: { title: '例会拍摄' }
    });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.written, 3, '应写入 3 条');
    assert.strictEqual(db._collections.notifications.length, 3, '库中应 3 条');
    assert.strictEqual(db._collections.notifications[0].type, 'task_assigned');
    assert.strictEqual(db._collections.notifications[0].isRead, false, '默认未读');
    assert.ok(db._collections.notifications[0].content.includes('例会拍摄'), '文案应含标题');
  });

  // TC-23 自定义文案优先于自动拼接
  await test('TC-23 自定义 content 覆盖模板', async () => {
    seed({ notifications: [] });
    const res = await sendNotification({
      type: 'task_assigned',
      userIds: ['u1'],
      content: '这是自定义通知'
    });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(db._collections.notifications[0].content, '这是自定义通知');
  });

  // TC-24 单字符串接收者归一化为数组
  await test('TC-24 单字符串接收者归一化', async () => {
    seed({ notifications: [] });
    const res = await sendNotification({ type: 'reminder', userIds: 'u9', taskInfo: { title: 't' } });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.written, 1, '应写入 1 条');
    assert.strictEqual(db._collections.notifications[0].userId, 'u9');
  });

  console.log('\nsendNotification 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
