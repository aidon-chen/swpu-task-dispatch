/**
 * 值班表导入云函数（PRD 值班表导入 · 方案 D）
 *
 * 数据：`duty_data.json` 随包携带（Python 解析 xlsx + 学期展开生成，约 1483 条）
 * 集合：duty_records { date:'YYYY-MM-DD', weekday:1-5, slot, team, name, source }
 *
 * action:
 *  - import（默认）：按 source 查重 → 过滤已有（date+slot+name）→ 批量 add（每批 50）
 *  - clean：删除全部 source 记录
 *
 * 权限：仅视觉中心主任（center_director）可执行；测试模式信任 debugRole（testConfig 门禁）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_CONFIG = require('./testConfig');
const DUTY_DATA = require('./duty_data.json');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

/** 学期标识（与 duty_data.json 的 source 一致） */
const SEMESTER = DUTY_DATA[0] ? DUTY_DATA[0].source : '2025-2026春季';

/** 每批插入条数（CloudBase add 数组批量上限以内） */
const BATCH_SIZE = 50;

/** 记录唯一键：date|slot|name */
function keyOf(r) {
  return `${r.date}|${r.slot}|${r.name}`;
}

/**
 * 过滤出需要插入的记录（去掉已存在的 date+slot+name）
 * 导出纯函数便于单测
 */
function filterNewRecords(all, existingKeys) {
  const seen = new Set();
  return all.filter(r => {
    const k = keyOf(r);
    if (existingKeys.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 拉取该学期已有的全部记录键（分页）
 */
async function fetchExistingKeys() {
  const collection = db.collection('duty_records');
  const keys = new Set();
  let skip = 0;
  for (;;) {
    const { data } = await collection
      .where({ source: SEMESTER })
      .field({ date: true, slot: true, name: true })
      .skip(skip)
      .limit(1000)
      .get();
    data.forEach(d => keys.add(keyOf(d)));
    if (data.length < 1000) break;
    skip += 1000;
  }
  return keys;
}

async function doImport() {
  const collection = db.collection('duty_records');
  const existingKeys = await fetchExistingKeys();
  const toInsert = filterNewRecords(DUTY_DATA, existingKeys);

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE).map(r => ({
      ...r,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await collection.add({ data: batch });
    inserted += batch.length;
  }

  return Response.ok(
    { inserted, skipped: existingKeys.size, total: DUTY_DATA.length },
    `导入完成：新增 ${inserted} 条，已存在 ${existingKeys.size} 条`
  );
}

async function doClean() {
  const collection = db.collection('duty_records');
  let removed = 0;
  // 注意：不能用 skip 分页（删除会改变数组长度导致 skip 偏移失效），
  // 每次取第一页（limit 1000）删到空即可
  for (;;) {
    const { data } = await collection
      .where({ source: SEMESTER })
      .field({ _id: true })
      .limit(1000)
      .get();
    if (data.length === 0) break;
    for (const d of data) {
      await collection.doc(d._id).remove();
      removed += 1;
    }
  }
  return Response.ok({ removed }, `已清理 ${removed} 条值班记录`);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = (event && event.action) || 'import';

  if (action !== 'import' && action !== 'clean') {
    return Response.paramError('action 必须为 import 或 clean');
  }

  try {
    // 1. 当前用户
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('用户不存在，请先登录');
    }
    const currentUser = users[0];

    // 2. 有效角色（测试模式信任 debugRole）
    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    if (
      TEST_CONFIG.enabled &&
      event && event.debugMode === true &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[event.debugRole];
      console.log('[importDutyRecords] 测试模式：信任调试角色', event.debugRole);
    }

    // 3. 权限：仅视觉中心主任
    if (effectiveLevel < ROLE_LEVEL.center_director) {
      return Response.permissionDenied('仅视觉中心主任可导入/清理值班表');
    }

    // 4. 分发
    if (action === 'clean') {
      return await doClean();
    }
    return await doImport();
  } catch (err) {
    console.error('[importDutyRecords] 错误:', err);
    return Response.paramError(err.message || '导入失败');
  }
};

exports.filterNewRecords = filterNewRecords;
exports.keyOf = keyOf;
