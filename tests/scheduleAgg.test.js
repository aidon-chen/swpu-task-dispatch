/**
 * scheduleAgg 聚合纯函数单元测试（日程总览）
 * 运行：node tests/scheduleAgg.test.js
 * 覆盖：五态判定与优先级 / 姓名匹配 / 值班分组去重 / 当天摘要
 */
const assert = require('assert');
const { groupDuties, buildMemberStates, buildDaySummary } = require('../utils/scheduleAgg.js');

let failed = 0;
function test(name, fnc) {
  try { fnc(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

const MEMBERS = [
  { _id: 'u1', name: '甲', status: 'available' },
  { _id: 'u2', name: '乙', status: 'available' },
  { _id: 'u3', name: '丙', status: 'busy' },
  { _id: 'u4', name: '丁', status: 'unavailable' },
  { _id: 'u5', name: '戊', status: 'available' }
];

// TC-221 五态：空闲
test('TC-221 无任务无值班时为空闲', () => {
  const res = buildMemberStates(MEMBERS, [], []);
  const m = res.find(x => x._id === 'u1');
  assert.strictEqual(m.state, 'available');
});

// TC-222 忙碌/不可用保留
test('TC-222 忙碌与不可用正确保留', () => {
  const res = buildMemberStates(MEMBERS, [], []);
  assert.strictEqual(res.find(x => x._id === 'u3').state, 'busy');
  assert.strictEqual(res.find(x => x._id === 'u4').state, 'unavailable');
});

// TC-223 值班中（姓名匹配）
test('TC-223 值班中按姓名匹配生效', () => {
  const res = buildMemberStates(MEMBERS, [], [{ name: '甲' }, { name: '戊' }]);
  assert.strictEqual(res.find(x => x._id === 'u1').state, 'duty');
  assert.strictEqual(res.find(x => x._id === 'u5').state, 'duty');
});

// TC-224 任务中（assignedTo 匹配 _id）
test('TC-224 任务中按指派 _id 生效', () => {
  const tasks = [{ assignedTo: ['u2'] }];
  const res = buildMemberStates(MEMBERS, tasks, []);
  assert.strictEqual(res.find(x => x._id === 'u2').state, 'task');
});

// TC-225 优先级：任务中 > 值班中 > 忙碌 > 不可用
test('TC-225 状态优先级正确（任务>值班>忙碌>不可用）', () => {
  // 丙 busy + 值班 → duty
  let res = buildMemberStates(MEMBERS, [], [{ name: '丙' }]);
  assert.strictEqual(res.find(x => x._id === 'u3').state, 'duty', '忙碌叠加值班应升为值班中');
  // 乙 值班 + 有任务 → task
  res = buildMemberStates(MEMBERS, [{ assignedTo: ['u2'] }], [{ name: '乙' }]);
  assert.strictEqual(res.find(x => x._id === 'u2').state, 'task', '值班叠加任务应升为任务中');
});

// TC-226 值班名单中未注册的成员不影响（名字不在 members）
test('TC-226 未注册值班人员不参与判定', () => {
  const res = buildMemberStates(MEMBERS, [], [{ name: '蔡江豪' }]);
  assert.ok(res.every(x => x.state !== 'duty'), '无匹配姓名不应出现值班中');
});

// TC-227 groupDuties 分组与去重
test('TC-227 值班按时段分组且同队去重', () => {
  const duties = [
    { slot: '1-2节', team: '视觉中心', name: '甲' },
    { slot: '1-2节', team: '视觉中心', name: '甲' },
    { slot: '1-2节', team: '采访组', name: '乙' },
    { slot: '6-7节', team: '视觉中心', name: '丙' }
  ];
  const grouped = groupDuties(duties);
  assert.strictEqual(grouped.length, 2, '两个时段');
  const first = grouped.find(g => g.slot === '1-2节');
  assert.strictEqual(first.cells.length, 2, '两个团队');
  assert.strictEqual(first.cells.find(c => c.team === '视觉中心').names, '甲', '同队同人去重');
  assert.ok(grouped[0].slot < grouped[1].slot, '按时段排序');
});

// TC-228 buildDaySummary
test('TC-228 当天摘要统计正确', () => {
  const tasks = [{}, {}, {}];
  const duties = [{}, {}];
  const members = buildMemberStates(MEMBERS, [{ assignedTo: ['u1'] }], [{ name: '丙' }]);
  const s = buildDaySummary(tasks, duties, members);
  assert.strictEqual(s.tasks, 3);
  assert.strictEqual(s.duties, 2);
  assert.strictEqual(s.available, 2, '乙/戊空闲；甲任务中、丙值班中、丁不可用');
});

console.log('\nscheduleAgg 测试完成');
if (failed) process.exitCode = 1;
