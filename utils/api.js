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
    // 调试员登录态：统一附加调试角色标记（覆盖所有云函数调用，云端严格校验库角色 role==='debug'）
    const user = require('./auth.js').getCurrentUser();
    if (user && user.isDebugLogin && user.isDebug && user.role) {
      data.debugMode = true;
      data.debugRole = user.role;
    }

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
  if (user && user.isDebugLogin && user.isDebug && user.role) {
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
 * 获取任务模板列表（主任及以上）
 * 返回用户可见的模板（本部门 + 跨部门，中心主任看全部）
 * @returns {Promise<Object>} { code, data: { templates: [...] } }
 */
async function getTemplates() {
  const data = {};
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
  }
  return callCloudFunction('getTemplates', data);
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
  if (user && user.isDebugLogin && user.isDebug && user.role) {
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
 * 获取当前用户通知列表
 * @param {Object} params - { page, pageSize }
 * @returns {Promise<Object>} { code, data: { list, total, unreadCount, page, pageSize, hasMore } }
 */
async function getNotifications(params = {}) {
  return callCloudFunction('getNotifications', params);
}

/**
 * 标记通知已读
 * @param {Object} params - { ids: string[], all: boolean }
 * @returns {Promise<Object>}
 */
async function markRead(params = {}) {
  return callCloudFunction('markRead', params);
}

/**
 * 更新值班排班矩阵
 * @param {Object} params - { userId, date, status } 或 { records: [{userId,date,status}] }
 * status 取值：available / busy / unavailable / clear（清除）
 * @returns {Promise<Object>}
 */
async function updateDutySchedule(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 updateDutySchedule 附加调试角色', user.role);
  }
  return callCloudFunction('updateDutySchedule', data);
}

/**
 * 发送通知（云函数内部调用入口，前端一般不直接使用）
 * @param {Object} notificationData - 通知数据
 * @returns {Promise<Object>}
 */
async function sendNotification(notificationData) {
  return callCloudFunction('sendNotification', notificationData);
}

/**
 * 生成正式密钥（仅视觉中心主任）
 * @param {Object} params - { role, department?, count? }
 * @returns {Promise<Object>}
 */
async function generateKey(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 generateKey 附加调试角色', user.role);
  }
  return callCloudFunction('generateKey', data);
}

/**
 * 获取统计报表
 * @param {Object} params - { period, year?, month?, semester?, startDate?, endDate?, department? }
 * @returns {Promise<Object>} { code, data: { summary, detailList } }
 */
async function getReport(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
  }
  return callCloudFunction('getReport', data);
}

/**
 * 爬取新闻网并匹配任务相关新闻
 * @param {Object} params - { taskId, keyword, time?, sourceUrl? }
 * @returns {Promise<Object>} { code, data: { newsList, fromCache } }
 */
async function crawlNews(params = {}) {
  return callCloudFunction('crawlNews', params);
}

/**
 * 获取新闻缓存
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} { code, data: { newsList, cachedAt } }
 */
async function getNewsCache(taskId) {
  return callCloudFunction('getNewsCache', { taskId });
}

/**
 * 导出报表（纯文本，前端复制到剪贴板）
 * @param {Object} params - 同 getReport
 * @returns {Promise<Object>} { code, data: { text, scope, period } }
 */
async function exportReport(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
  }
  return callCloudFunction('exportReport', data);
}

/**
 * 任务评价（M7）
 * 任务完成后，被指派成员 / 主任打分(1-5) + 文字评价；重复提交覆盖本人旧评
 * @param {Object} params - { taskId, score, comment? }
 * @returns {Promise<Object>} { code, data: { taskId, avgScore, ratingCount } }
 */
async function rateTask(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 rateTask 附加调试角色', user.role);
  }
  return callCloudFunction('rateTask', data);
}

/**
 * 生成/清理测试数据（测试工具中心）
 * @param {Object} params - { action: 'generate_users'|'generate'|'clean', count? }
 * @returns {Promise<Object>}
 */
async function generateTestData(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 generateTestData 附加调试角色', user.role);
  }
  return callCloudFunction('generateTestData', data);
}

/**
 * 导入/清理值班记录（仅视觉中心主任）
 * @param {Object} params - { action?: 'import'|'clean' }
 * @returns {Promise<Object>}
 */
async function importDutyRecords(params = {}) {
  const data = { ...params };
  const user = require('./auth.js').getCurrentUser();
  if (user && user.isDebugLogin && user.isDebug && user.role) {
    data.debugMode = true;
    data.debugRole = user.role;
    console.log('[API] 调试模式：向 importDutyRecords 附加调试角色', user.role);
  }
  return callCloudFunction('importDutyRecords', data);
}

/**
 * 获取值班记录
 * @param {Object} params - { date?, weekday?, team?, source?, page?, pageSize? }
 * @returns {Promise<Object>} { code, data: { list, total } }
 */
async function getDutyRecords(params = {}) {
  return callCloudFunction('getDutyRecords', params);
}

module.exports = {
  callCloudFunction,
  login,
  verifyKey,
  generateTestKey,
  createTask,
  updateTask,
  getTasks,
  getTemplates,
  updateUserStatus,
  getDutySchedule,
  updateDutySchedule,
  createLocation,
  getLocations,
  getNotifications,
  markRead,
  sendNotification,
  generateKey,
  getReport,
  crawlNews,
  getNewsCache,
  exportReport,
  rateTask,
  generateTestData,
  importDutyRecords,
  getDutyRecords
};
