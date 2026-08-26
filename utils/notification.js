/**
 * 通知工具：维护 TabBar 未读红点
 *
 * 说明：当前 tabBar 仅有「任务 / 值班表 / 统计 / 我的」四项，没有独立的「消息」tab。
 *       因此未读红点挂在「我的」(profile) tab 上（tabBar index = 3），
 *       由 profile 页的「消息中心」入口承载跳转。后续若新增消息 tab，改这里即可。
 */

const api = require('./api.js');

/** profile 在 tabBar 中的索引 */
const PROFILE_TAB_INDEX = 3;

/**
 * 拉取未读数并刷新「我的」tab 红点
 * @returns {Promise<number>} 未读数
 */
async function refreshUnreadBadge() {
  try {
    const res = await api.getNotifications({ page: 1, pageSize: 1 });
    const count = (res && res.code === 0 && res.data) ? res.data.unreadCount || 0 : 0;

    if (count > 0) {
      wx.setTabBarBadge({
        index: PROFILE_TAB_INDEX,
        text: count > 99 ? '99+' : String(count)
      });
    } else {
      wx.removeTabBarBadge({ index: PROFILE_TAB_INDEX });
    }
    return count;
  } catch (err) {
    // 红点失败不应阻断页面
    console.error('[notification] 刷新红点失败:', err);
    return 0;
  }
}

module.exports = { refreshUnreadBadge, PROFILE_TAB_INDEX };
