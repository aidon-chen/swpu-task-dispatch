/**
 * 权限校验工具
 * 提供统一的权限判断和角色校验方法
 */

const storage = require('./storage.js');

/** 角色等级映射（数值越大权限越高） */
const ROLE_LEVEL = {
  member: 1,
  photo_director: 2,
  video_director: 2,
  center_director: 3,
  // 调试员：发布版（测试模式关闭）下等同 member 权限，仅测试模式可通过扮演角色提权
  debug: 1
};

/**
 * 获取当前用户信息（从持久化存储读取，键为 td_userInfo）
 * @returns {Object|null} 用户信息对象
 */
function getCurrentUser() {
  return storage.getUserInfo();
}

/**
 * 获取当前用户角色等级
 * @returns {number} 角色等级，未登录返回0
 */
function getCurrentRoleLevel() {
  const user = getCurrentUser();
  if (!user || !user.role) {
    return 0;
  }
  return ROLE_LEVEL[user.role] || 0;
}

/**
 * 获取当前用户部门
 * @returns {string} 部门名称
 */
function getCurrentDepartment() {
  const user = getCurrentUser();
  return user ? user.department : '';
}

/**
 * 检查是否已登录
 * @returns {boolean}
 */
function isLoggedIn() {
  return !!getCurrentUser();
}

/**
 * 检查当前用户是否为指定角色或更高
 * @param {string} role - 目标角色
 * @returns {boolean}
 */
function hasRole(role) {
  const currentLevel = getCurrentRoleLevel();
  const targetLevel = ROLE_LEVEL[role] || 0;
  return currentLevel >= targetLevel;
}

/**
 * 检查是否为部门主任及以上（主任级）
 * @returns {boolean}
 */
function isDirector() {
  return getCurrentRoleLevel() >= ROLE_LEVEL.photo_director;
}

/**
 * 检查是否为视觉中心主任
 * @returns {boolean}
 */
function isCenterDirector() {
  return getCurrentRoleLevel() >= ROLE_LEVEL.center_director;
}

/**
 * 检查是否为普通成员
 * @returns {boolean}
 */
function isMember() {
  const user = getCurrentUser();
  return user && user.role === 'member';
}

/**
 * 检查当前用户是否为调试员账号（role='debug' 或本地 isDebug 标记）
 * 调试员可独占测试入口，并在测试模式下扮演任意角色
 * @returns {boolean}
 */
function isDebugUser() {
  const user = getCurrentUser();
  if (!user) return false;
  return user.role === 'debug' || user.isDebug === true;
}

/**
 * 检查用户是否有权管理指定部门
 * @param {string} department - 目标部门
 * @returns {boolean}
 */
function canManageDepartment(department) {
  const user = getCurrentUser();
  if (!user) return false;

  // 视觉中心主任可以管理所有部门
  if (user.role === 'center_director') return true;

  // 部门主任只能管理自己的部门
  if (
    (user.role === 'photo_director' && department === 'photography') ||
    (user.role === 'video_director' && department === 'video')
  ) {
    return true;
  }

  return false;
}

/**
 * 检查是否能查看指定部门的数据
 * @param {string} department - 目标部门
 * @returns {boolean}
 */
function canViewDepartment(department) {
  const user = getCurrentUser();
  if (!user) return false;

  // 视觉中心主任和对应部门主任可以查看
  if (user.role === 'center_director') return true;
  if (user.department === department) return true;

  return false;
}

/**
 * 检查用户是否是任务的创建者
 * @param {Object} task - 任务对象
 * @returns {boolean}
 */
function isTaskCreator(task) {
  const user = getCurrentUser();
  if (!user || !task) return false;
  return task.creatorId === user._id;
}

/**
 * 检查用户是否被指派到任务
 * @param {Object} task - 任务对象
 * @returns {boolean}
 */
function isAssignedToTask(task) {
  const user = getCurrentUser();
  if (!user || !task || !task.assignedTo) return false;
  return task.assignedTo.includes(user._id);
}

/**
 * 需要登录的页面守卫
 * 在页面onLoad或onShow中调用，未登录则跳转登录页
 * @returns {boolean} 是否已登录
 */
function requireLogin() {
  if (!isLoggedIn()) {
    wx.reLaunch({
      url: '/pages/login/login'
    });
    return false;
  }
  return true;
}

/**
 * 需要特定角色的页面守卫
 * @param {string} role - 要求的角色
 * @returns {boolean} 是否有权限
 */
function requireRole(role) {
  if (!requireLogin()) return false;

  if (!hasRole(role)) {
    wx.showToast({
      title: '权限不足，无法访问',
      icon: 'none',
      duration: 2000
    });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 2000);
    return false;
  }
  return true;
}

module.exports = {
  ROLE_LEVEL,
  getCurrentUser,
  getCurrentRoleLevel,
  getCurrentDepartment,
  isLoggedIn,
  hasRole,
  isDirector,
  isCenterDirector,
  isMember,
  isDebugUser,
  canManageDepartment,
  canViewDepartment,
  isTaskCreator,
  isAssignedToTask,
  requireLogin,
  requireRole
};
