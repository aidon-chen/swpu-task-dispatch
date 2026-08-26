/**
 * createTask 云函数单元测试（M8 任务模板）
 * 运行：node tests/createTask.test.js
 * 覆盖：普通建任务 / 存为模板 / 从模板实例化 / 校验 / 角色门禁 / 通知发送
 */
const assert = require('assert');
const { installMock, getMockDb, seed, getCallLog, clearCallLog } = require('./_mockCloudSdk.js');

installMock();
const createTask = require('../cloudfunctions/createTask/index.js').main;
const db = getMockDb();

function seedDirector(role = 'photo_director', department = 'photography') {
  seed({
    users: [{ _id: 'u-dir', openid: 'test-openid', name: '主任', role, department }],
    tasks: []
  });
}

function directorCtx(role = 'photo_director') {
  return { debugMode: true, debugRole: role };
}

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`❌ ${name}: ${err.message}`);
  }
}

async function run() {
  // TC-01 普通建任务：成功 + 发出指派通知
  await test('TC-01 普通建任务成功并发通知', async () => {
    seedDirector();
    clearCallLog();
    const res = await createTask({
      ...directorCtx(),
      title: '例会拍摄',
      type: '会议拍摄',
      startTime: '2026-07-20 10:00',
      assignedTo: ['u-member-1']
    });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.isTemplate, false, '非模板');
    const log = getCallLog();
    assert.strictEqual(log.length, 1, '应调用一次 sendNotification');
    assert.strictEqual(log[0].name, 'sendNotification');
    assert.deepStrictEqual(log[0].data.userIds, ['u-member-1']);
  });

  // TC-02 存为模板：免时间/人员校验，不发电通知
  await test('TC-02 存为模板成功且不出通知', async () => {
    seedDirector();
    clearCallLog();
    const res = await createTask({
      ...directorCtx(),
      isTemplate: true,
      templateName: '例会模板',
      title: '例会拍摄',
      type: '会议拍摄'
      // 故意不传 startTime / assignedTo
    });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.isTemplate, true, '应为模板');
    const doc = db._collections.tasks.find((t) => t.isTemplate);
    assert.ok(doc, '库中应存在模板');
    assert.strictEqual(doc.templateName, '例会模板');
    assert.strictEqual(doc.assignedTo.length, 0, '模板不存人员');
    assert.strictEqual(getCallLog().length, 0, '模板不应发通知');
  });

  // TC-03 从模板实例化：合并字段 + 事件覆盖 + 发电通知
  await test('TC-03 从模板实例化合并字段并发通知', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', name: '主任', role: 'photo_director', department: 'photography' }],
      tasks: [{
        _id: 'tpl-1', isTemplate: true, templateName: '例会模板',
        title: '模板标题', type: '会议拍摄', location: '教学楼A', contact: '王老师'
      }]
    });
    clearCallLog();
    const res = await createTask({
      ...directorCtx(),
      fromTemplateId: 'tpl-1',
      title: '实际标题(覆盖)',
      startTime: '2026-07-21 09:00',
      assignedTo: ['u-member-2']
    });
    assert.strictEqual(res.code, 0, '应成功');
    assert.strictEqual(res.data.isTemplate, false, '实例化后是真实任务');
    const doc = db._collections.tasks.find((t) => !t.isTemplate && t.title === '实际标题(覆盖)');
    assert.ok(doc, '应生成真实任务');
    assert.strictEqual(doc.location, '教学楼A', '地点应从模板继承');
    assert.strictEqual(doc.contact, '王老师', '联络人应从模板继承');
    const log = getCallLog();
    assert.strictEqual(log.length, 1, '应发一次通知');
    assert.deepStrictEqual(log[0].data.userIds, ['u-member-2']);
  });

  // TC-04 模板缺标题：参数错误
  await test('TC-04 模板缺标题报错', async () => {
    seedDirector();
    const res = await createTask({
      ...directorCtx(),
      isTemplate: true,
      type: '会议拍摄'
    });
    assert.strictEqual(res.code, 1, '应参数错误');
  });

  // TC-05 普通成员无调试角色：权限不足
  await test('TC-05 普通成员无调试角色被拒', async () => {
    seed({
      users: [{ _id: 'u-mem', openid: 'test-openid', name: '成员', role: 'member', department: '' }]
      // 注意：不传 debugMode/debugRole → 云端按库内 member 校验
    });
    const res = await createTask({
      title: 'x', type: '会议拍摄', startTime: '2026-07-20 10:00', assignedTo: ['u-mem']
    });
    assert.strictEqual(res.code, 2, '应权限不足');
  });

  console.log('\ncreateTask 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
