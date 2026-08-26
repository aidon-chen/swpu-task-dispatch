/**
 * 消息中心页面
 * 展示当前用户的小程序内通知（任务指派 / 提醒 / 取消 / 完成）
 * 点击跳转关联任务；支持单条已读、全部已读、下拉刷新、上拉加载更多。
 */

const api = require('../../utils/api.js');
const notification = require('../../utils/notification.js');

/** 通知类型对应的图标与标题 */
const TYPE_META = {
  task_assigned: { icon: '📥', label: '任务指派' },
  task_cancelled: { icon: '🚫', label: '任务取消' },
  reminder: { icon: '⏰', label: '任务提醒' },
  task_completed: { icon: '✅', label: '任务完成' }
};

Page({
  data: {
    list: [],
    loading: false,
    refreshing: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    unreadCount: 0,
    empty: false
  },

  onShow() {
    this.loadNotifications(true);
  },

  /**
   * 加载通知列表
   */
  async loadNotifications(reset = false) {
    if (this.data.loading) return;

    if (reset) {
      this.setData({ page: 1, list: [], hasMore: true });
    }

    this.setData({ loading: true });

    try {
      const res = await api.getNotifications({
        page: this.data.page,
        pageSize: this.data.pageSize
      });

      if (res.code === 0 && res.data) {
        const { list, total, unreadCount, hasMore } = res.data;
        const decorated = (list || []).map((item) => ({
          ...item,
          meta: TYPE_META[item.type] || { icon: '🔔', label: '通知' }
        }));

        this.setData({
          list: reset ? decorated : [...this.data.list, ...decorated],
          hasMore: !!hasMore,
          unreadCount: unreadCount || 0,
          empty: total === 0,
          page: reset ? 1 : this.data.page + 1
        });

        // 同步 TabBar 红点
        notification.refreshUnreadBadge();
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[消息中心] 加载失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 点击单条通知：标记已读并跳转关联任务
   */
  async onItemTap(e) {
    const { id, taskid } = e.currentTarget.dataset;
    if (!id) return;

    // 乐观更新本地未读态
    const list = this.data.list.map((item) =>
      item._id === id ? { ...item, isRead: true } : item
    );
    const unreadCount = Math.max(0, this.data.unreadCount - 1);
    this.setData({ list, unreadCount });

    // 异步标记已读（不阻塞跳转）
    api.markRead({ ids: [id] }).then(() => notification.refreshUnreadBadge());

    if (taskid) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${taskid}` });
    }
  },

  /**
   * 全部已读
   */
  async onMarkAllRead() {
    if (this.data.unreadCount === 0) return;

    wx.showLoading({ title: '处理中...' });
    try {
      const res = await api.markRead({ all: true });
      if (res.code === 0) {
        const list = this.data.list.map((item) => ({ ...item, isRead: true }));
        this.setData({ list, unreadCount: 0 });
        notification.refreshUnreadBadge();
        wx.showToast({ title: '已全部标为已读', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[消息中心] 全部已读失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadNotifications(true);
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadNotifications(false);
    }
  },

  /**
   * 空态引导
   */
  onGoTasks() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
