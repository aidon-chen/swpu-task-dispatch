/**
 * 更新值班排班云函数
 * 支持批量写入/更新 duty_schedule 集合（userId + date 唯一键 upsert）
 * status 取值：available（空闲）/ busy（忙碌）/ unavailable（不可用）/ clear（清除）
 *
 * 权限：
 *  - 成员可编辑自己的排班
 *  - 部门主任可编辑本部门成员
 *  - 视觉中心主任可编辑全部成员
 *  - 测试模式下信任前端传入的 debugRole（与 createTask/createLocation 一致）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_CONFIG = require('./testConfig');

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

/** 合法的排班状态 */
const VALID_STATUS = ['available', 'busy', 'unavailable'];

/**
 * 归一化入参为记录数组
 */
function normalizeRecords(event) {
  if (Array.isArray(event.records) && event.records.length > 0) {
    return event.records.slice(0, 200); // 防止过大批量
  }
  if (event.userId && event.date) {
    return [{ userId: event.userId, date: event.date, status: event.status }];
  }
  return [];
}

/**
 * 校验单条记录字段
 */
function validateRecord(record) {
  if (!record || !record.userId || !record.date) return 'userId 和 date 必填';
  if (typeof record.userId !== 'string' || typeof record.date !== 'string') return 'userId/date 类型错误';
  // status 可为 clear（清除）或合法状态
  if (record.status === 'clear' || record.status === null || record.status === undefined || record.status === '') {
    record.status = 'clear';
  } else if (!VALID_STATUS.includes(record.status)) {
    return `status 非法，可选：${VALID_STATUS.join('、')} 或 clear`;
  }
  // date 格式 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return 'date 格式应为 YYYY-MM-DD';
  return null;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const records = normalizeRecords(event);
  if (records.length === 0) {
    return Response.paramError('缺少排班记录（records 或 userId+date）');
  }

  // 字段校验
  for (const r of records) {
    const err = validateRecord(r);
    if (err) return Response.paramError(err);
  }

  try {
    const usersCollection = db.collection('users');
    const dutyCollection = db.collection('duty_schedule');

    // 1. 当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在，请先登录');
    }
    const currentUser = users[0];

    // 2. 计算有效角色等级（测试模式信任前端 debugRole）
    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    let effectiveRole = currentUser.role;
    if (
      TEST_CONFIG.enabled &&
      (currentUser.role === 'debug' || currentUser.isDebugUser === true) &&
      event.debugMode === true &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[event.debugRole];
      effectiveRole = event.debugRole;
      console.log('[updateDutySchedule] 测试模式：信任调试角色', event.debugRole);
    }

    // 3. 收集被操作的目标用户，批量查部门以便鉴权
    const targetIds = [...new Set(records.map(r => r.userId))];
    const { data: targets } = await usersCollection
      .where({ _id: _.in(targetIds) })
      .field({ _id: true, department: true, role: true })
      .get();
    const targetMap = {};
    targets.forEach(t => { targetMap[t._id] = t; });

    // 4. 逐条鉴权 + upsert
    const results = [];
    for (const r of records) {
      const target = targetMap[r.userId];

      // 4.1 目标用户必须存在
      if (!target) {
        results.push({ userId: r.userId, date: r.date, ok: false, error: '目标用户不存在' });
        continue;
      }

      // 4.2 本人可改自己；否则需主任权限
      const isSelf = r.userId === currentUser._id;
      if (!isSelf) {
        if (effectiveLevel < ROLE_LEVEL.photo_director) {
          results.push({ userId: r.userId, date: r.date, ok: false, error: '权限不足' });
          continue;
        }
        // 部门主任仅能管本部门
        if (effectiveRole !== 'center_director' && target.department !== currentUser.department) {
          results.push({ userId: r.userId, date: r.date, ok: false, error: '无权管理部门外成员' });
          continue;
        }
      }

      // 4.3 upsert
      try {
        const query = dutyCollection.where({ userId: r.userId, date: r.date });
        const { data: existing } = await query.get();

        if (r.status === 'clear') {
          if (existing.length > 0) {
            await dutyCollection.doc(existing[0]._id).remove();
          }
          results.push({ userId: r.userId, date: r.date, ok: true, action: 'removed' });
        } else if (existing.length > 0) {
          await dutyCollection.doc(existing[0]._id).update({
            data: { status: r.status, updatedBy: currentUser._id, updatedAt: new Date() }
          });
          results.push({ userId: r.userId, date: r.date, ok: true, action: 'updated', status: r.status });
        } else {
          await dutyCollection.add({
            data: {
              userId: r.userId,
              date: r.date,
              status: r.status,
              createdBy: currentUser._id,
              updatedAt: new Date()
            }
          });
          results.push({ userId: r.userId, date: r.date, ok: true, action: 'created', status: r.status });
        }
      } catch (e) {
        results.push({ userId: r.userId, date: r.date, ok: false, error: e.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const failCount = results.length - successCount;

    return Response.ok(
      { results, successCount, failCount, total: results.length },
      `成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}`
    );
  } catch (err) {
    console.error('[updateDutySchedule] 错误:', err);
    return Response.paramError(err.message || '更新排班失败');
  }
};
