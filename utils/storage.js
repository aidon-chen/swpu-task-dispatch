/**
 * 本地存储工具
 * 封装微信小程序的 Storage API，提供类型安全的读写方法
 */

/** 缓存键名前缀 */
const PREFIX = 'td_';

/** 存储键名常量 */
const KEYS = {
  USER_INFO: 'userInfo',
  TOKEN: 'token',
  OPENID: 'openid',
  LAST_LOGIN: 'lastLogin',
  NEWS_CACHE: 'newsCache',
  FILTER_PREFS: 'filterPrefs',
  DRAFT_TASK: 'draftTask'
};

/**
 * 获取完整的存储键名
 * @param {string} key - 短键名
 * @returns {string}
 */
function getFullKey(key) {
  return `${PREFIX}${key}`;
}

/**
 * 设置存储值
 * @param {string} key - 键名（使用KEYS常量）
 * @param {any} value - 值（自动JSON序列化）
 * @returns {boolean}
 */
function set(key, value) {
  try {
    wx.setStorageSync(getFullKey(key), JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[Storage] 设置 ${key} 失败:`, err);
    return false;
  }
}

/**
 * 获取存储值
 * @param {string} key - 键名
 * @param {any} defaultValue - 默认值
 * @returns {any}
 */
function get(key, defaultValue = null) {
  try {
    const raw = wx.getStorageSync(getFullKey(key));
    if (raw === '' || raw === undefined || raw === null) {
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage] 读取 ${key} 失败:`, err);
    return defaultValue;
  }
}

/**
 * 删除存储值
 * @param {string} key - 键名
 * @returns {boolean}
 */
function remove(key) {
  try {
    wx.removeStorageSync(getFullKey(key));
    return true;
  } catch (err) {
    console.error(`[Storage] 删除 ${key} 失败:`, err);
    return false;
  }
}

/**
 * 清空所有应用相关存储
 */
function clearAll() {
  try {
    const info = wx.getStorageInfoSync();
    info.keys.forEach(key => {
      if (key.startsWith(PREFIX)) {
        wx.removeStorageSync(key);
      }
    });
  } catch (err) {
    console.error('[Storage] 清空存储失败:', err);
  }
}

/**
 * 保存用户信息
 * @param {Object} userInfo - 用户信息对象
 */
function saveUserInfo(userInfo) {
  set(KEYS.USER_INFO, userInfo);
  if (userInfo && userInfo.openid) {
    set(KEYS.OPENID, userInfo.openid);
  }
}

/**
 * 获取用户信息
 * @returns {Object|null}
 */
function getUserInfo() {
  return get(KEYS.USER_INFO);
}

/**
 * 保存登录Token
 * @param {string} token
 */
function saveToken(token) {
  set(KEYS.TOKEN, token);
}

/**
 * 获取登录Token
 * @returns {string}
 */
function getToken() {
  return get(KEYS.TOKEN, '');
}

/**
 * 获取OpenID
 * @returns {string}
 */
function getOpenId() {
  return get(KEYS.OPENID, '');
}

/**
 * 保存新闻缓存（本地）
 * @param {string} taskId - 任务ID
 * @param {Array} newsList - 新闻列表
 */
function saveNewsCache(taskId, newsList) {
  const allCache = get(KEYS.NEWS_CACHE, {});
  allCache[taskId] = {
    newsList,
    cachedAt: Date.now()
  };
  set(KEYS.NEWS_CACHE, allCache);
}

/**
 * 获取新闻缓存（本地）
 * @param {string} taskId - 任务ID
 * @returns {Object|null}
 */
function getNewsCache(taskId) {
  const allCache = get(KEYS.NEWS_CACHE, {});
  const cache = allCache[taskId];
  if (!cache) return null;

  // 检查是否过期（24小时）
  const hours = (Date.now() - cache.cachedAt) / (1000 * 60 * 60);
  if (hours > 24) {
    delete allCache[taskId];
    set(KEYS.NEWS_CACHE, allCache);
    return null;
  }

  return cache;
}

/**
 * 保存筛选偏好
 * @param {Object} prefs - 偏好设置
 */
function saveFilterPrefs(prefs) {
  set(KEYS.FILTER_PREFS, prefs);
}

/**
 * 获取筛选偏好
 * @returns {Object}
 */
function getFilterPrefs() {
  return get(KEYS.FILTER_PREFS, {});
}

/**
 * 保存任务草稿
 * @param {Object} draft - 草稿数据
 */
function saveDraftTask(draft) {
  set(KEYS.DRAFT_TASK, draft);
}

/**
 * 获取任务草稿
 * @returns {Object|null}
 */
function getDraftTask() {
  return get(KEYS.DRAFT_TASK);
}

/**
 * 清除任务草稿
 */
function clearDraftTask() {
  remove(KEYS.DRAFT_TASK);
}

module.exports = {
  KEYS,
  set,
  get,
  remove,
  clearAll,
  saveUserInfo,
  getUserInfo,
  saveToken,
  getToken,
  getOpenId,
  saveNewsCache,
  getNewsCache,
  saveFilterPrefs,
  getFilterPrefs,
  saveDraftTask,
  getDraftTask,
  clearDraftTask
};
