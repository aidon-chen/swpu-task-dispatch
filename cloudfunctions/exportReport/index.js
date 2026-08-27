/**
 * 导出报表云函数
 * 复用 getReport 的统计结果，格式化为纯文本报表（前端复制到剪贴板）
 * 这样统计逻辑只维护一份，导出与展示保持一致
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

function periodLabel(event, user) {
  if (event.period === 'month') {
    const now = new Date();
    const y = event.year || now.getFullYear();
    const m = event.month || (now.getMonth() + 1);
    return `${y}年${m}月`;
  }
  if (event.period === 'custom') {
    return `${event.startDate || '?'} ~ ${event.endDate || '?'}`;
  }
  return event.semester || '本学期';
}

function scopeLabel(event, effectiveLevel, user) {
  if (effectiveLevel < ROLE_LEVEL.photo_director) return '仅自己';
  if (effectiveLevel < ROLE_LEVEL.center_director) return `${user.department === 'photography' ? '摄影部' : '视频部'}（本部门）`;
  if (event.department) return `${event.department === 'photography' ? '摄影部' : '视频部'}（指定部门）`;
  return '全部成员';
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const usersCollection = db.collection('users');
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在，请先登录');
    }
    const currentUser = users[0];

    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    if (
      TEST_CONFIG.enabled &&
      currentUser.role === 'debug' &&
      event.debugMode &&
      event.debugRole &&
      ROLE_LEVEL[event.debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[event.debugRole];
    }

    // 复用 getReport 计算结果
    const reportRes = await cloud.callFunction({
      name: 'getReport',
      data: event
    });

    if (!reportRes || !reportRes.result || reportRes.result.code !== 0) {
      return Response.paramError('统计计算失败');
    }

    const { summary, detailList } = reportRes.result.data;

    const pLabel = periodLabel(event, currentUser);
    const sLabel = scopeLabel(event, effectiveLevel, currentUser);

    const lines = [];
    lines.push('【任务派发统计报表】');
    lines.push(`统计周期：${pLabel}`);
    lines.push(`统计范围：${sLabel}`);
    lines.push('');
    lines.push(`总任务数：${summary.totalTasks}`);
    lines.push(`已完成：${summary.completedTasks}（完成率 ${summary.totalTasks > 0 ? Math.round(summary.completedTasks / summary.totalTasks * 100) : 0}%）`);
    lines.push(`总工时：${summary.totalHours} 小时`);
    lines.push(`参与人数：${summary.memberCount}`);
    lines.push('');
    lines.push('— 成员明细 —');
    if (detailList.length === 0) {
      lines.push('（暂无数据）');
    } else {
      detailList.forEach((d, i) => {
        lines.push(`${i + 1}. ${d.name} — 总 ${d.total} / 完成 ${d.completed}（${d.rate}%）`);
      });
    }
    lines.push('');
    lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);

    return Response.ok({ text: lines.join('\n'), scope: sLabel, period: pLabel }, '报表生成成功');
  } catch (err) {
    console.error('[exportReport] 错误:', err);
    return Response.paramError(err.message || '导出失败');
  }
};
