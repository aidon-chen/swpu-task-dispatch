/**
 * 首页 - 任务列表概览
 * 根据用户角色展示不同的任务视图
 * 普通成员：自己的任务
 * 主任：部门所有任务
 * 视觉中心主任：所有任务
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 当前标签页 */
    activeTab: 'all',
    /** 任务列表 */
    tasks: [],
    /** 筛选条件 */
    filter: {
      status: '',
      keyword: '',
      page: 1,
      pageSize: 20
    },
    /** 是否还有更多 */
    hasMore: true,
    /** 是否正在加载 */
    loading: false,
    /** 是否正在刷新 */
    refreshing: false,
    /** 用户信息 */
    userInfo: null,
    /** 是否为主任 */
    isDirector: false,
    /** 是否为视觉中心主任 */
    isCenterDirector: false,
    /** 任务统计 */
    stats: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0
    }
  },

  onLoad() {
    if (!auth.requireLogin()) return;
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserInfo();
    this.loadTasks(true);
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = auth.getCurrentUser();
    this.setData({
      userInfo,
      isDirector: auth.isDirector(),
      isCenterDirector: auth.isCenterDirector()
    });
  },

  /**
   * 加载任务列表
   */
  async loadTasks(reset = false) {
    if (this.data.loading) return;

    if (reset) {
      this.setData({
        'filter.page': 1,
        tasks: [],
        hasMore: true
      });
    }

    this.setData({ loading: true });

    try {
      const res = await api.getTasks({
        status: this.data.filter.status,
        keyword: this.data.filter.keyword,
        page: this.data.filter.page,
        pageSize: this.data.filter.pageSize,
        myTasks: this.data.activeTab === 'mine'
      });

      if (res.code === 0 && res.data) {
        const { tasks, total, stats } = res.data;

        this.setData({
          tasks: reset ? tasks : [...this.data.tasks, ...tasks],
          hasMore: tasks.length >= this.data.filter.pageSize,
          stats: stats || this.data.stats,
          'filter.page': reset ? 1 : this.data.filter.page + 1
        });
      }
    } catch (err) {
      console.error('[首页] 加载任务失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.setData({ refreshing: true });
    this.loadTasks(true);
  },

  /**
   * 触底加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadTasks(false);
    }
  },

  /**
   * 切换标签
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;

    this.setData({ activeTab: tab });
    this.loadTasks(true);
  },

  /**
   * 搜索任务
   */
  onSearch(e) {
    const keyword = e.detail.value;
    this.setData({ 'filter.keyword': keyword });
    this.loadTasks(true);
  },

  /**
   * 状态筛选
   */
  onFilterStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      'filter.status': this.data.filter.status === status ? '' : status
    });
    this.loadTasks(true);
  },

  /**
   * 跳转创建任务
   */
  onCreateTask() {
    if (!auth.isDirector()) {
      wx.showToast({ title: '仅主任可创建任务', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/create-task/create-task' });
  },

  /**
   * 接受任务
   */
  async onAcceptTask(e) {
    const { taskId } = e.detail;
    wx.showLoading({ title: '处理中...' });

    try {
      const res = await api.updateTask(taskId, { status: 'confirmed' });
      if (res.code === 0) {
        wx.showToast({ title: '已接受任务', icon: 'success' });
        this.loadTasks(true);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[首页] 接受任务失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 取消任务
   */
  async onCancelTask(e) {
    const { taskId } = e.detail;
    wx.showLoading({ title: '取消中...' });

    try {
      const res = await api.updateTask(taskId, { status: 'cancelled' });
      if (res.code === 0) {
        wx.showToast({ title: '任务已取消', icon: 'success' });
        this.loadTasks(true);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[首页] 取消任务失败:', err);
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 标记完成
   */
  async onCompleteTask(e) {
    const { taskId } = e.detail;
    wx.showLoading({ title: '处理中...' });

    try {
      const res = await api.updateTask(taskId, { status: 'completed' });
      if (res.code === 0) {
        wx.showToast({ title: '已标记完成', icon: 'success' });
        this.loadTasks(true);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[首页] 完成任务失败:', err);
    } finally {
      wx.hideLoading();
    }
  }
});
