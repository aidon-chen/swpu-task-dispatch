/**
 * 爬虫工具（前端辅助）
 * 实际的爬取逻辑在云函数crawlNews中执行
 * 此文件提供前端调用爬虫和展示结果的辅助方法
 */

const api = require('./api.js');
const storage = require('./storage.js');

/**
 * 发起新闻匹配请求
 * @param {string} taskId - 任务ID
 * @param {string} taskTitle - 任务标题
 * @param {Date|string} taskStartTime - 任务开始时间
 * @returns {Promise<Object>} 匹配结果
 */
async function matchNews(taskId, taskTitle, taskStartTime) {
  // 先检查本地缓存
  const localCache = storage.getNewsCache(taskId);
  if (localCache) {
    console.log('[爬虫] 使用本地缓存结果');
    return { code: 0, data: { newsList: localCache.newsList, fromCache: true } };
  }

  // 检查云端缓存
  const cacheRes = await api.getNewsCache(taskId);
  if (cacheRes.code === 0 && cacheRes.data && cacheRes.data.newsList) {
    console.log('[爬虫] 使用云端缓存结果');
    // 同步到本地缓存
    storage.saveNewsCache(taskId, cacheRes.data.newsList);
    return { code: 0, data: { ...cacheRes.data, fromCache: true } };
  }

  // 发起爬取
  wx.showLoading({ title: '正在匹配新闻...' });
  try {
    const res = await api.crawlNews({
      taskId,
      taskTitle,
      taskStartTime
    });

    if (res.code === 0 && res.data && res.data.newsList) {
      // 保存到本地缓存
      storage.saveNewsCache(taskId, res.data.newsList);
    }

    return res;
  } finally {
    wx.hideLoading();
  }
}

/**
 * 格式化新闻匹配评分
 * @param {number} score - 原始评分（0-1）
 * @returns {string} 百分比格式
 */
function formatMatchScore(score) {
  return `${Math.round(score * 100)}%`;
}

/**
 * 获取匹配度等级
 * @param {number} score - 原始评分
 * @returns {Object} { label, color }
 */
function getMatchLevel(score) {
  if (score >= 0.8) return { label: '高度匹配', color: '#4CAF50' };
  if (score >= 0.5) return { label: '中度匹配', color: '#FF9800' };
  if (score >= 0.3) return { label: '低度匹配', color: '#FF5722' };
  return { label: '可能无关', color: '#9E9E9E' };
}

module.exports = {
  matchNews,
  formatMatchScore,
  getMatchLevel
};
