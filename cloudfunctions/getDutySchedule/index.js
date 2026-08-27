/**
 * 获取值班表云函数
 * 返回部门成员列表及其状态信息
 * 支持月度日历视图和全局视图
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const Response = {
  ok: (data, message = '成功') => ({ code: 0, data, message }),
  paramError: (message = '参数错误') => ({ code: 1, data: null, message }),
  permissionDenied: (message = '权限不足') => ({ code: 2, data: null, message }),
  notFound: (message = '数据不存在') => ({ code: 3, data: null, message })
};

const ROLE_LEVEL = { member: 1, photo_director: 2, video_director: 2, center_director: 3 };

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { department, year, month, selfOnly, onlyAvailable } = event;

  try {
    const usersCollection = db.collection('users');
    const statusCollection = db.collection('user_status');

    // 1. 查找当前用户
    const { data: users } = await usersCollection.where({ openid: OPENID }).get();
    if (users.length === 0) {
      return Response.notFound('用户不存在');
    }

    const currentUser = users[0];
    // 调试员：测试模式（携带 debugRole）按扮演角色提权，否则等同 member
    const effectiveRole = (currentUser.role === 'debug' || currentUser.isDebugUser === true)
      ? (event.debugMode && event.debugRole && ROLE_LEVEL[event.debugRole] ? event.debugRole : 'member')
      : currentUser.role;
    const userLevel = ROLE_LEVEL[effectiveRole] || 0;

    // 2. 如果只查询自己
    if (selfOnly) {
      const { data: statuses } = await statusCollection
        .where({ userId: currentUser._id })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const myStatus = statuses.length > 0 ? statuses[0] : null;
      return Response.ok({
        myStatus,
        history: statuses
      });
    }

    // 3. 确定查询的部门
    let targetDepartment = department;

    // 视觉中心主任可查看所有部门
    if (userLevel >= ROLE_LEVEL.center_director) {
      // 不指定部门则返回所有
    } else if (userLevel >= ROLE_LEVEL.photo_director) {
      // 部门主任只能看自己部门
      targetDepartment = currentUser.department;
    } else {
      // 普通成员只能看自己部门
      targetDepartment = currentUser.department;
    }

    // 4. 查询部门成员
    const memberQuery = {};
    if (targetDepartment) {
      memberQuery.department = targetDepartment;
    }

    const { data: members } = await usersCollection
      .where(memberQuery)
      .field({
        _id: true, name: true, avatar: true,
        department: true, role: true, weeklySchedule: true
      })
      .get();

    // 5. 获取每个成员的最新状态
    const memberIds = members.map(m => m._id);

    let statusQuery = { userId: _.in(memberIds) };
    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      statusQuery.createdAt = _.gte(startDate).and(_.lte(endDate));
    }

    const { data: allStatuses } = await statusCollection
      .where(statusQuery)
      .orderBy('createdAt', 'desc')
      .get();

    // 构建状态映射（每人取最新状态）
    const memberStatusMap = {};
    const statusUpdatedMap = {};
    allStatuses.forEach(s => {
      if (!memberStatusMap[s.userId]) {
        memberStatusMap[s.userId] = s.status;
        statusUpdatedMap[s.userId] = s;
      }
    });

    // 成员列表附加状态
    const membersWithStatus = members.map(m => ({
      ...m,
      status: memberStatusMap[m._id] || 'available',
      reason: statusUpdatedMap[m._id] ? statusUpdatedMap[m._id].reason : '',
      startDate: statusUpdatedMap[m._id] ? statusUpdatedMap[m._id].startDate : null,
      endDate: statusUpdatedMap[m._id] ? statusUpdatedMap[m._id].endDate : null
    }));

    // 6. 构建可用性矩阵（从 duty_schedule 集合读取指定年月的排班）
    let availability = {};
    const summary = {
      available: 0,
      busy: 0,
      unavailable: 0,
      total: membersWithStatus.length
    };

    membersWithStatus.forEach(m => {
      const s = m.status;
      if (s === 'available') summary.available++;
      else if (s === 'busy') summary.busy++;
      else summary.unavailable++;
    });

    // 读取 duty_schedule 矩阵（按 userId × date）
    if (year && month && memberIds.length > 0) {
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const { data: duty } = await db.collection('duty_schedule')
          .where({
            userId: _.in(memberIds),
            date: _.gte(startDate).and(_.lte(endDate))
          })
          .limit(1000)
          .get();
        duty.forEach(d => {
          if (!availability[d.userId]) availability[d.userId] = {};
          availability[d.userId][d.date] = d.status;
        });
      } catch (e) {
        console.error('[getDutySchedule] 读取 duty_schedule 失败:', e.message);
      }
    }

    // 如果只查看可用成员
    let resultMembers = membersWithStatus;
    if (onlyAvailable) {
      resultMembers = membersWithStatus.filter(m => m.status === 'available');
    }

    return Response.ok({
      members: resultMembers,
      availability,
      summary
    });
  } catch (err) {
    console.error('[getDutySchedule] 错误:', err);
    return Response.paramError(err.message || '获取值班表失败');
  }
};
