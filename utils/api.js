/**
 * API封装层 - 统一管理所有云函数调用
 * 提供统一的请求格式、错误处理和响应解析
 */

/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {Object} data - 请求参数
 * @returns {Promise<Object>} { code, data, message }
 */
async function callCloudFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data
    });
    return res.result;
  } catch (err) {
    console.error(`[API] 云函数 ${name} 调用失败:`, err);
    return {
      code: -1,
      data: null,
      message: err.errMsg || '网络请求失败，请检查网络连接'
    };
  }
}

/**
 * 用户登录
 * @returns {Promise<Object>}
 */
async function login() {
  return callCloudFunction('login');
}

/**
 * 验证权限密钥
 * @param {string} key - 密钥字符串
 * @returns {Promise<Object>}
 */
async function verifyKey(key) {
  return callCloudFunction('verifyKey', { key });
}

/**
 * 生成测试密钥
 * @param {string} role - 目标角色
 * @param {string} department - 目标部门（可选）
 * @returns {Promise<Object>}
 */
async function generateTestKey(role, department) {
  return callCloudFunction('generateTestKey', { role, department });
}

/**
 * 创建任务
 * @param {Object} taskData - 任务数据
 * @returns {Promise<Object>}
 */
async function createTask(taskData) {
  const data = { ...taskData };
  // 测试模式：调试登录用户在本地持有角色，云端需在测试开关下信任
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 createTask 附加调试角色', user.role);
  } else {
    console.log('[API] 非调试登录态，createTask 不附加 debugRole（云端将按数据库真实角色校验）');
  }
  return callCloudFunction('createTask', data);
}

/**
 * 更新任务
 * @param {string} taskId - 任务ID
 * @param {Object} updates - 更新字段
 * @returns {Promise<Object>}
 */
async function updateTask(taskId, updates) {
  return callCloudFunction('updateTask', { taskId, updates });
}

/**
 * 获取任务列表
 * @param {Object} params - 查询参数
 * @param {string} params.status - 任务状态筛选
 * @param {string} params.department - 部门筛选
 * @param {number} params.page - 分页页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.keyword - 搜索关键词
 * @param {boolean} params.myTasks - 只看我的任务
 * @returns {Promise<Object>}
 */
async function getTasks(params = {}) {
  return callCloudFunction('getTasks', params);
}

/**
 * 更新用户状态
 * @param {Object} statusData - 状态数据
 * @returns {Promise<Object>}
 */
async function updateUserStatus(statusData) {
  return callCloudFunction('updateUserStatus', statusData);
}

/**
 * 获取值班表
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>}
 */
async function getDutySchedule(params = {}) {
  return callCloudFunction('getDutySchedule', params);
}

/**
 * 创建机位
 * @param {Object} locationData - 机位数据
 * @returns {Promise<Object>}
 */
async function createLocation(locationData) {
  const data = { ...locationData };
  // 测试模式：调试登录用户在本地持有角色，云端需在测试开关下信任
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 createLocation 附加调试角色', user.role);
  } else {
    console.log('[API] 非调试登录态，createLocation 不附加 debugRole（云端将按数据库真实角色校验）');
  }
  return callCloudFunction('createLocation', data);
}

/**
 * 获取机位列表
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>}
 */
async function getLocations(params = {}) {
  return callCloudFunction('getLocations', params);
}

/**
 * 发送通知
 * @param {Object} notificationData - 通知数据
 * @returns {Promise<Object>}
 */
async function sendNotification(notificationData) {
  return callCloudFunction('sendNotification', notificationData);
}

/**
 * 获取统计报表
 * TODO: 云函数 getReport 尚未实现，当前返回占位数据
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>}
 */
async function getReport(params = {}) {
  return { code: -2, data: null, message: '统计报表功能开发中' };
  // return callCloudFunction('getReport', params);
}

/**
 * 爬取新闻网
 * TODO: 云函数 crawlNews 尚未实现
 * @param {Object} params - 爬取参数
 * @returns {Promise<Object>}
 */
async function crawlNews(params = {}) {
  return { code: -2, data: null, message: '新闻爬取功能开发中' };
  // return callCloudFunction('crawlNews', params);
}

/**
 * 获取新闻缓存
 * TODO: 云函数 getNewsCache 尚未实现
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>}
 */
async function getNewsCache(taskId) {
  return { code: -2, data: null, message: '新闻缓存功能开发中' };
  // return callCloudFunction('getNewsCache', { taskId });
}

/**
 * 导出报表
 * TODO: 云函数 exportReport 尚未实现
 * @param {Object} params - 导出参数
 * @returns {Promise<Object>}
 */
async function exportReport(params = {}) {
  return { code: -2, data: null, message: '报表导出功能开发中' };
  // return callCloudFunction('exportReport', params);
}

module.exports = {
  callCloudFunction,
  login,
  verifyKey,
  generateTestKey,
  createTask,
  updateTask,
  getTasks,
  updateUserStatus,
  getDutySchedule,
  createLocation,
  getLocations,
  sendNotification,
  getReport,
  crawlNews,
  getNewsCache,
  exportReport
};
