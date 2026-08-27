/**
 * 任务评价云函数（M7）
 * 任务完成后，被指派成员 / 主任可打分(1-5) + 文字评价
 * 重复提交覆盖本人旧评；自动重算任务平均分 avgScore
 *
 * 事件参数：
 *  - taskId: 任务 ID（必填）
 *  - score: 1-5 整数（必填）
 *  - comment: 文字评价，可选，≤200 字
 *  - debugMode / debugRole: 测试模式调试角色（仅 testConfig enabled 时信任）
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
const MAX_COMMENT_LEN = 200;

function isValidScore(score) {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

function computeAvgScore(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + r.score, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { taskId, score, comment, debugMode, debugRole } = event;

  // 1. 参数校验
  if (!taskId) {
    return Response.paramError('缺少必要参数：taskId');
  }
  if (score === undefined || !isValidScore(score)) {
    return Response.paramError('评分须为 1-5 的整数');
  }
  const text = (comment === undefined || comment === null) ? '' : String(comment).trim();
  if (text.length > MAX_COMMENT_LEN) {
    return Response.paramError(`评价文字最多 ${MAX_COMMENT_LEN} 字`);
  }

  try {
    // 2. 查找任务
    const tasksCollection = db.collection('tasks');
    const { data: tasks } = await tasksCollection.doc(taskId).get();
    if (!tasks || tasks.length === 0) {
      return Response.notFound('任务不存在');
    }
    const task = tasks.length ? tasks[0] : tasks;

    // 3. 查找当前用户
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.permissionDenied('用户不存在');
    }
    const currentUser = users[0];

    // 有效角色（测试模式下可被 debugRole 覆盖）
    let effectiveLevel = ROLE_LEVEL[currentUser.role] || 0;
    if (
      TEST_CONFIG.enabled &&
      (currentUser.role === 'debug' || currentUser.isDebugUser === true) &&
      debugMode &&
      debugRole &&
      ROLE_LEVEL[debugRole]
    ) {
      effectiveLevel = ROLE_LEVEL[debugRole];
    }

    // 4. 仅已完成可评
    if (task.status !== 'completed') {
      return Response.paramError('任务完成后才能评价');
    }

    // 5. 权限：被指派成员 或 主任
    const isAssigned = task.assignedTo && task.assignedTo.includes(currentUser._id);
    const isDirector = effectiveLevel >= ROLE_LEVEL.photo_director;
    if (!isDirector && !isAssigned) {
      return Response.permissionDenied('只有任务参与人或主任可以评价');
    }

    // 6. 内容安全校验（不可用时降级放行）
    if (text) {
      try {
        await cloud.openapi.security.msgSecCheck({ content: text });
      } catch (e) {
        console.error('[rateTask] msgSecCheck 不可用，降级放行:', e.errCode || e.message || e);
      }
    }

    // 7. 覆盖本人旧评 + 重算均分
    const myRating = { userId: currentUser._id, score, comment: text, createdAt: new Date() };
    const ratings = (task.ratings || []).filter(r => r.userId !== currentUser._id);
    ratings.push(myRating);
    const avgScore = computeAvgScore(ratings);

    await tasksCollection.doc(taskId).update({
      data: { ratings, avgScore, updatedAt: new Date() }
    });

    return Response.ok({ taskId, avgScore, ratingCount: ratings.length }, '评价成功');
  } catch (err) {
    console.error('[rateTask] 错误:', err);
    return Response.paramError(err.message || '评价失败');
  }
};

exports.computeAvgScore = computeAvgScore;
