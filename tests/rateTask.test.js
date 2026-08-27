/**
 * rateTask 云函数单元测试（M7 任务评价）
 * 运行：node tests/rateTask.test.js
 * 覆盖：参数校验 / 仅完成后可评 / 权限（指派成员·主任）/ 重复提交覆盖旧评 /
 *       多人均分 / 调试角色信任 / 评论长度限制 / computeAvgScore
 */
const assert = require('assert');
const { installMock, seed, getMockDb, setWXContext } = require('./_mockCloudSdk.js');

installMock();
const rateTask = require('../cloudfunctions/rateTask/index.js').main;
const { computeAvgScore } = require('../cloudfunctions/rateTask/index.js');
const rateTestConfig = require('../cloudfunctions/rateTask/testConfig');

const USERS = [
  { _id: 'u_member', openid: 'test-openid', name: '张三', department: 'photography', role: 'member' },
  { _id: 'u_other', openid: 'other-openid', name: '李四', department: 'video', role: 'member' },
  { _id: 'u_dir', openid: 'dir-openid', name: '王五', department: 'photography', role: 'photo_director' }
];
const COMPLETED = { _id: 't_done', assignedTo: ['u_member'], status: 'completed', title: '已完成任务' };
const PENDING = { _id: 't_pending', assignedTo: ['u_member'], status: 'pending', title: '未完成任务' };

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function getTask(taskId) {
  const { data } = await getMockDb().collection('tasks').doc(taskId).get();
  return data.length ? data[0] : data;
}

async function run() {
  // TC-115 缺 taskId
  await test('TC-115 缺 taskId 返回 paramError', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    const res = await rateTask({ score: 5 });
    assert.strictEqual(res.code, 1);
  });

  // TC-116/117 非法分数
  await test('TC-116 分数 0 返回 paramError', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    const res = await rateTask({ taskId: 't_done', score: 0 });
    assert.strictEqual(res.code, 1);
  });

  await test('TC-117 分数 6 返回 paramError', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    const res = await rateTask({ taskId: 't_done', score: 6 });
    assert.strictEqual(res.code, 1);
  });

  // TC-118 仅完成后可评（AC2）
  await test('TC-118 未完成任务不可评价', async () => {
    seed({ users: USERS.slice(), tasks: [PENDING] });
    const res = await rateTask({ taskId: 't_pending', score: 5 });
    assert.strictEqual(res.code, 1);
    assert.ok(res.message.includes('完成'), '应提示任务完成后才能评价');
  });

  // TC-119 非指派成员不可评
  await test('TC-119 非指派成员评价被拒', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    setWXContext({ OPENID: 'other-openid' });
    const res = await rateTask({ taskId: 't_done', score: 4, comment: '不关我事' });
    setWXContext({ OPENID: 'test-openid' });
    assert.strictEqual(res.code, 2, '应 permissionDenied');
  });

  // TC-120 指派成员正常评价：写入 ratings + avgScore
  await test('TC-120 指派成员评价成功并写入', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    const res = await rateTask({ taskId: 't_done', score: 5, comment: '拍得很好' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.avgScore, 5);
    assert.strictEqual(res.data.ratingCount, 1);
    const task = await getTask('t_done');
    assert.strictEqual(task.ratings.length, 1);
    assert.strictEqual(task.ratings[0].userId, 'u_member');
    assert.strictEqual(task.ratings[0].score, 5);
    assert.strictEqual(task.ratings[0].comment, '拍得很好');
  });

  // TC-121 重复提交覆盖本人旧评（ratings 不增、分数更新、均分重算）
  await test('TC-121 重复提交覆盖本人旧评', async () => {
    seed({ users: USERS.slice(), tasks: [{ ...COMPLETED, ratings: [{ userId: 'u_member', score: 5, comment: '旧评', createdAt: new Date() }], avgScore: 5 }] });
    const res = await rateTask({ taskId: 't_done', score: 3, comment: '改评' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.ratingCount, 1, '覆盖后仍 1 条');
    assert.strictEqual(res.data.avgScore, 3, '均分应重算为 3');
    const task = await getTask('t_done');
    assert.strictEqual(task.ratings.length, 1);
    assert.strictEqual(task.ratings[0].score, 3);
    assert.strictEqual(task.ratings[0].comment, '改评');
  });

  // TC-122 主任可评任意已完成任务（用干净对象，规避模块级常量被 mock 就地 update 污染）
  await test('TC-122 主任可评价', async () => {
    seed({ users: USERS.slice(), tasks: [{ _id: 't_done', assignedTo: ['u_member'], status: 'completed', title: '已完成任务' }] });
    setWXContext({ OPENID: 'dir-openid' });
    const res = await rateTask({ taskId: 't_done', score: 4 });
    setWXContext({ OPENID: 'test-openid' });
    assert.strictEqual(res.code, 0);
    const task = await getTask('t_done');
    assert.strictEqual(task.ratings[0].userId, 'u_dir');
  });

  // TC-123 多人评价均分正确（5 + 3 → 4）
  await test('TC-123 多人评价均分正确', async () => {
    seed({ users: USERS.slice(), tasks: [{ ...COMPLETED, ratings: [{ userId: 'u_member', score: 5, comment: '', createdAt: new Date() }], avgScore: 5 }] });
    setWXContext({ OPENID: 'dir-openid' });
    const res = await rateTask({ taskId: 't_done', score: 3 });
    setWXContext({ OPENID: 'test-openid' });
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.data.avgScore, 4, '(5+3)/2=4');
    assert.strictEqual(res.data.ratingCount, 2);
  });

  // TC-124 调试角色信任：调试员（库角色 debug）以 photo_director 身份评他人任务
  await test('TC-124 调试角色信任生效', async () => {
    seed({ users: USERS.map(u => u._id === 'u_member' ? { ...u, role: 'debug' } : u), tasks: [{ _id: 't_other', assignedTo: ['u_other'], status: 'completed', title: '别人任务' }] });
    rateTestConfig.enabled = true;
    rateTestConfig.allowDebugRoleOverride = true;
    const res = await rateTask({ taskId: 't_other', score: 4, debugMode: true, debugRole: 'photo_director' });
    rateTestConfig.enabled = false; rateTestConfig.allowDebugRoleOverride = false;
    assert.strictEqual(res.code, 0, '调试主任应可评');
  });

  // TC-125 评论超长
  await test('TC-125 评论超过 200 字被拒', async () => {
    seed({ users: USERS.slice(), tasks: [COMPLETED] });
    const res = await rateTask({ taskId: 't_done', score: 5, comment: '评'.repeat(201) });
    assert.strictEqual(res.code, 1);
  });

  // TC-126 computeAvgScore 纯函数
  await test('TC-126 computeAvgScore 计算正确', async () => {
    assert.strictEqual(computeAvgScore([]), 0);
    assert.strictEqual(computeAvgScore(null), 0);
    assert.strictEqual(computeAvgScore([{ score: 5 }]), 5);
    assert.strictEqual(computeAvgScore([{ score: 5 }, { score: 4 }]), 4.5);
    assert.strictEqual(computeAvgScore([{ score: 5 }, { score: 4 }, { score: 3 }]), 4);
  });

  console.log('\nrateTask 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
