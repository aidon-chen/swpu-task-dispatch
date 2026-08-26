/**
 * 获取值班记录云函数（PRD 值班表导入 · 方案 D）
 * 供值班表页「本周值班」区块按 weekday / date / team / source 查询
 *
 * 入参：
 *  - date: 'YYYY-MM-DD'（查某天，可选）
 *  - weekday: 1-5（按周几查，可选）
 *  - team: 团队名（可选）
 *  - source: 学期（可选，默认最新）
 *  - page/pageSize: 分页（默认 200 上限 500）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message })
};

exports.main = async (event) => {
  const { date, weekday, team, source, page = 1, pageSize = 200 } = event || {};

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.paramError('date 格式应为 YYYY-MM-DD');
  }
  if (weekday !== undefined && (weekday < 1 || weekday > 5)) {
    return Response.paramError('weekday 应为 1-5');
  }

  try {
    const collection = db.collection('duty_records');
    const query = {};
    if (date) query.date = date;
    if (weekday !== undefined) query.weekday = weekday;
    if (team) query.team = team;
    if (source) query.source = source;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 200));

    const { total } = await collection.where(query).count();
    const { data } = await collection
      .where(query)
      .orderBy('weekday', 'asc')
      .orderBy('slot', 'asc')
      .skip((p - 1) * ps)
      .limit(ps)
      .get();

    return Response.ok({ list: data, total, page: p, pageSize: ps }, '查询成功');
  } catch (err) {
    console.error('[getDutyRecords] 错误:', err);
    return Response.paramError(err.message || '查询失败');
  }
};
