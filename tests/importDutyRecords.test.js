/**
 * importDutyRecords 云函数单元测试（值班表导入 · 方案 D）
 * 运行：node tests/importDutyRecords.test.js
 * 覆盖：filterNewRecords 纯函数 / keyOf / 权限（仅中心主任）/
 *       导入写库与幂等 / clean / 调试角色信任 / 非法 action
 */
const assert = require('assert');
const { installMock, seed, getMockDb, setWXContext } = require('./_mockCloudSdk.js');

installMock();
const fn = require('../cloudfunctions/importDutyRecords/index.js').main;
const { filterNewRecords, keyOf } = require('../cloudfunctions/importDutyRecords/index.js');
const testConfig = require('../cloudfunctions/importDutyRecords/testConfig');

const DIR = { _id: 'u-dir', openid: 'test-openid', name: '主任', department: '', role: 'center_director' };
const MEMBER = { _id: 'u-mem', openid: 'test-openid', name: '成员', department: 'photography', role: 'member' };

let failed = 0;
async function test(name, fnc) {
  try { await fnc(); console.log(`✅ ${name}`); }
  catch (err) { failed++; console.error(`❌ ${name}: ${err.message}`); }
}

function on() { testConfig.enabled = true; }
function off() { testConfig.enabled = false; }

async function run() {
  // TC-213 filterNewRecords 纯函数
  await test('TC-213 filterNewRecords 过滤已有与重复', async () => {
    const all = [
      { date: '2026-03-02', slot: '1-2节', name: '甲' },
      { date: '2026-03-02', slot: '1-2节', name: '乙' },
      { date: '2026-03-03', slot: '3-4节', name: '甲' }
    ];
    const existing = new Set([keyOf(all[0])]);
    const fresh = filterNewRecords(all, existing);
    assert.strictEqual(fresh.length, 2, '应排除已存在 1 条');
    assert.ok(fresh.every(r => !existing.has(keyOf(r))));
    // 同文件内重复（同一 date+slot+name 出现两次）应只保留一条
    const dup = filterNewRecords([all[0], all[0]], new Set());
    assert.strictEqual(dup.length, 1, '文件内重复应去重');
  });

  // TC-214 keyOf 格式
  await test('TC-214 keyOf 生成唯一键', async () => {
    assert.strictEqual(keyOf({ date: '2026-03-02', slot: '1-2节', name: '甲' }), '2026-03-02|1-2节|甲');
  });

  // TC-215 权限：member 导入被拒
  await test('TC-215 普通成员导入被拒', async () => {
    on();
    seed({ users: [MEMBER], duty_records: [] });
    const res = await fn({ action: 'import' });
    off();
    assert.strictEqual(res.code, 2, '应 permissionDenied');
  });

  // TC-216 中心主任导入成功
  await test('TC-216 视觉中心主任导入成功', async () => {
    on();
    seed({ users: [DIR], duty_records: [] });
    const res = await fn({ action: 'import' });
    off();
    assert.strictEqual(res.code, 0, res.message);
    assert.ok(res.data.inserted > 1000, `应写入全量（1483），实际 ${res.data.inserted}`);
    const db = getMockDb();
    const { data: records } = await db.collection('duty_records').where({ source: '2025-2026春季' }).get();
    assert.strictEqual(records.length, res.data.inserted, '库中数量与返回一致');
    assert.ok(records.every(r => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)), 'date 格式正确');
    assert.ok(records.every(r => r.weekday >= 1 && r.weekday <= 5), 'weekday 合法');
  });

  // TC-217 幂等：二次导入不重复
  await test('TC-217 重复导入不产生重复记录', async () => {
    on();
    seed({ users: [DIR], duty_records: [] });
    await fn({ action: 'import' });
    const res2 = await fn({ action: 'import' });
    off();
    assert.strictEqual(res2.code, 0);
    assert.strictEqual(res2.data.inserted, 0, '二次导入应全跳过');
    const db = getMockDb();
    const { data: records } = await db.collection('duty_records').get();
    const uniq = new Set(records.map(r => keyOf(r)));
    assert.strictEqual(records.length, uniq.size, '库中无重复键');
  });

  // TC-218 clean：只清 source 记录
  await test('TC-218 clean 只清理本学期值班记录', async () => {
    on();
    seed({ users: [DIR], duty_records: [] });
    await fn({ action: 'import' });
    // 混入一条别的 source
    const db = getMockDb();
    await db.collection('duty_records').add({ data: { date: '2026-07-01', weekday: 3, slot: '1-2节', team: 'X', name: '别人', source: 'OTHER' } });
    const res = await fn({ action: 'clean' });
    off();
    assert.strictEqual(res.code, 0);
    assert.ok(res.data.removed >= 1000, `应清空本学期记录，实际 ${res.data.removed}`);
    const { data: left } = await db.collection('duty_records').get();
    assert.strictEqual(left.length, 1, '仅剩 OTHER 记录');
  });

  // TC-219 调试角色信任：member + debugRole=center_director
  await test('TC-219 调试角色信任生效', async () => {
    on();
    seed({ users: [MEMBER], duty_records: [] });
    const res = await fn({ action: 'import', debugMode: true, debugRole: 'center_director' });
    off();
    assert.strictEqual(res.code, 0, '调试中心主任应可导入');
    assert.ok(res.data.inserted > 1000);
  });

  // TC-220 非法 action
  await test('TC-220 非法 action 返回 paramError', async () => {
    on();
    seed({ users: [DIR], duty_records: [] });
    const res = await fn({ action: 'foo' });
    off();
    assert.strictEqual(res.code, 1);
  });

  console.log('\nimportDutyRecords 测试完成');
  if (failed) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
