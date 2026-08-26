/**
 * getDutySchedule 云函数单元测试（值班表部门范围 / 只看自己）
 * 运行：node tests/getDutySchedule.test.js
 * 覆盖：部门主任只看本部、中心主任看全部、selfOnly、用户不存在
 */
const assert = require('assert');
const { installMock, getMockDb, seed } = require('./_mockCloudSdk.js');

installMock();
const getDutySchedule = require('../cloudfunctions/getDutySchedule/index.js').main;
const db = getMockDb();

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

async function run() {
  const members = [
    { _id: 'u-dir', openid: 'test-openid', name: '主任', department: 'photography', role: 'photo_director' },
    { _id: 'u-p1', name: '摄员', department: 'photography', role: 'member' },
    { _id: 'u-v1', name: '视员', department: 'video', role: 'member' }
  ];

  // TC-59 部门主任：只看本部成员（photography）
  await test('TC-59 部门主任只看本部', async () => {
    seed({ users: members, user_status: [] });
    const res = await getDutySchedule({});
    const ids = res.data.members.map((m) => m._id).sort();
    assert.deepStrictEqual(ids, ['u-dir', 'u-p1'], '应仅 photography 两人');
  });

  // TC-60 中心主任：看全部成员
  await test('TC-60 中心主任看全部', async () => {
    seed({
      users: [
        { _id: 'u-center', openid: 'test-openid', name: '中心', department: '', role: 'center_director' },
        ...members.filter((m) => m._id !== 'u-dir')
      ],
      user_status: []
    });
    const res = await getDutySchedule({});
    assert.strictEqual(res.data.members.length, 3, '应三人（中心+摄+视）');
  });

  // TC-61 selfOnly：返回本人最新状态
  await test('TC-61 只看自己状态', async () => {
    seed({
      users: [{ _id: 'u-dir', openid: 'test-openid', role: 'photo_director', department: 'photography' }],
      user_status: [
        { _id: 's1', userId: 'u-dir', status: 'busy', createdAt: new Date(1) },
        { _id: 's2', userId: 'u-dir', status: 'available', createdAt: new Date(2) }
      ]
    });
    const res = await getDutySchedule({ selfOnly: true });
    assert.strictEqual(res.data.myStatus.status, 'available', '应取最新状态');
  });

  // TC-62 用户不存在 → notFound
  await test('TC-62 用户不存在返回 notFound', async () => {
    seed({ users: [], user_status: [] });
    const res = await getDutySchedule({});
    assert.strictEqual(res.code, 3);
  });

  console.log('\ngetDutySchedule 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
