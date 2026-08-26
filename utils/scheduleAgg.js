/**
 * 日程总览聚合纯函数（PRD_日程总览.md）
 * 无外部依赖，便于离线单测
 * 数据源：getTasks(当天任务) / getDutyRecords(当天值班) / getDutySchedule(成员出勤)
 */

/**
 * 值班记录按 slot 分组（展示用）
 * @param {Array} duties - [{slot, team, name}]
 * @returns {Array} [{slot, cells:[{team, names:'a、b'}]}]
 */
function groupDuties(duties) {
  const map = {};
  duties.forEach(d => {
    if (!map[d.slot]) map[d.slot] = [];
    const cell = map[d.slot].find(c => c.team === d.team);
    if (cell) {
      if (!cell.names.includes(d.name)) cell.names.push(d.name);
    } else {
      map[d.slot].push({ team: d.team, names: [d.name] });
    }
  });
  return Object.keys(map).sort().map(slot => ({
    slot,
    cells: map[slot].map(c => ({ team: c.team, names: c.names.join('、') }))
  }));
}

/**
 * 五态判定：任务中(task) > 值班中(duty) > 忙碌(busy) > 不可用(unavailable) > 空闲(available)
 * 姓名匹配：duty_records.name ↔ members[].name（匹配不到的人不受值班影响）
 * @param {Array} members - [{_id, name, status}] status 来自 user_status（available/busy/unavailable）
 * @param {Array} tasks - 当天任务（含 assignedTo: [userId]）
 * @param {Array} duties - 当天值班（含 name）
 * @returns {Array} [{_id, name, avatar, state}]
 */
function buildMemberStates(members, tasks, duties) {
  const taskUserIds = new Set();
  tasks.forEach(t => (t.assignedTo || []).forEach(uid => taskUserIds.add(uid)));
  const dutyNames = new Set(duties.map(d => d.name));
  return members.map(m => {
    let state = 'available';
    if (taskUserIds.has(m._id)) {
      state = 'task';
    } else if (dutyNames.has(m.name)) {
      state = 'duty';
    } else if (m.status === 'busy') {
      state = 'busy';
    } else if (m.status === 'unavailable') {
      state = 'unavailable';
    }
    return { _id: m._id, name: m.name, avatar: m.avatar || '', state };
  });
}

/**
 * 当天摘要
 * @returns {Object} { tasks, duties, available }
 */
function buildDaySummary(dayTasks, dayDuties, dayMembers) {
  return {
    tasks: dayTasks.length,
    duties: dayDuties.length,
    available: dayMembers.filter(m => m.state === 'available').length
  };
}

module.exports = { groupDuties, buildMemberStates, buildDaySummary };
