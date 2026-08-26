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
const notification = require('../../utils/notification.js');

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
      type: '',
      department: '',
      startDate: '',
      endDate: '',
      sort: 'time',
      isCrossDepartment: false,
      page: 1,
      pageSize: 20
    },
    /** 是否展开高级筛选面板 */
    showFilterPanel: false,
    /** 是否存在非默认筛选（用于角标与空态文案） */
    hasActiveFilter: false,
    /** 部门选项 */
    departmentOptions: [
      { value: 'photography', label: '摄影部' },
      { value: 'video', label: '视频部' }
    ],
    /** 排序选项 */
    sortOptions: [
      { value: 'time', label: '按时间' },
      { value: 'priority', label: '按优先级' }
    ],
    /** 部门筛选显示名 */
    departmentLabel: '部门',
    /** 排序显示名 */
    sortLabel: '按时间',
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
    // M9-3 筛选持久化：恢复上次筛选
    const saved = wx.getStorageSync('td_taskFilter');
    if (saved && typeof saved === 'object') {
      const filter = { ...this.data.filter, ...saved };
      this.setData({
        filter,
        hasActiveFilter: this.computeHasActiveFilter(filter),
        departmentLabel: this.getDepartmentLabel(filter.department),
        sortLabel: this.getSortLabel(filter.sort)
      });
    }
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserInfo();
    this.loadTasks(true);
    // 同步「我的」tab 未读红点
    notification.refreshUnreadBadge();
    // 同步自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
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

    const { status, keyword, type, department, startDate, endDate, sort, isCrossDepartment } = this.data.filter;

    // M9 边界：非法时间区间 → 提示且不发请求
    if (startDate && endDate && startDate > endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    try {
      const res = await api.getTasks({
        status,
        keyword,
        type,
        department,
        startDate,
        endDate,
        sort,
        isCrossDepartment: isCrossDepartment || undefined,
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

  // ===== M9 高级筛选 =====

  /**
   * 展开/收起高级筛选面板
   */
  onToggleFilterPanel() {
    this.setData({ showFilterPanel: !this.data.showFilterPanel });
  },

  /**
   * 类型关键词输入（仅更新本地，点「应用」才生效）
   */
  onFilterTypeInput(e) {
    this.updateFilter({ type: e.detail.value }, { save: false });
  },

  /**
   * 部门选择
   */
  onFilterDepartment(e) {
    const idx = Number(e.detail.value);
    const dept = this.data.departmentOptions[idx] ? this.data.departmentOptions[idx].value : '';
    this.updateFilter({ department: dept });
  },

  /**
   * 开始日期
   */
  onStartDateChange(e) {
    this.updateFilter({ startDate: e.detail.value });
  },

  /**
   * 结束日期
   */
  onEndDateChange(e) {
    this.updateFilter({ endDate: e.detail.value });
  },

  /**
   * 仅看跨部门：点击行文字取反
   */
  onToggleCrossDept() {
    this.updateFilter({ isCrossDepartment: !this.data.filter.isCrossDepartment });
  },

  /**
   * 仅看跨部门：switch 变更用值
   */
  onSwitchCrossDept(e) {
    this.updateFilter({ isCrossDepartment: !!e.detail.value });
  },

  /**
   * 排序方式（时间/优先级）
   */
  onSortChange(e) {
    const idx = Number(e.detail.value);
    const sort = this.data.sortOptions[idx] ? this.data.sortOptions[idx].value : 'time';
    this.updateFilter({ sort });
  },

  /**
   * 应用筛选：保存 + 收起面板 + 刷新
   */
  onApplyFilters() {
    this.saveFilter();
    this.setData({ showFilterPanel: false });
    this.loadTasks(true);
  },

  /**
   * 重置高级筛选
   */
  onResetFilter() {
    this.updateFilter({
      type: '', department: '', startDate: '', endDate: '',
      isCrossDepartment: false, sort: 'time'
    }, { save: false });
    this.saveFilter();
    this.setData({ showFilterPanel: false });
    this.loadTasks(true);
  },

  /**
   * 统一更新筛选：合并 + 刷新角标/标签
   */
  updateFilter(patch, opts = {}) {
    const filter = { ...this.data.filter, ...patch };
    this.setData({
      filter,
      hasActiveFilter: this.computeHasActiveFilter(filter),
      departmentLabel: this.getDepartmentLabel(filter.department),
      sortLabel: this.getSortLabel(filter.sort)
    });
    if (opts.save !== false) this.saveFilter();
  },

  /**
   * 判断是否存在非默认的高级筛选（status/keyword 走独立控件，不计入）
   */
  computeHasActiveFilter(filter) {
    return !!(filter.type || filter.department || filter.startDate || filter.endDate ||
      filter.isCrossDepartment || filter.sort !== 'time');
  },

  /**
   * 部门显示名
   */
  getDepartmentLabel(dept) {
    if (!dept) return '部门';
    const opt = this.data.departmentOptions.find(o => o.value === dept);
    return opt ? opt.label : dept;
  },

  /**
   * 排序显示名
   */
  getSortLabel(sort) {
    const opt = this.data.sortOptions.find(o => o.value === sort);
    return opt ? opt.label : '按时间';
  },

  /**
   * 持久化筛选条件（M9-3，排除分页字段）
   */
  saveFilter() {
    const f = this.data.filter;
    wx.setStorageSync('td_taskFilter', {
      status: f.status,
      keyword: f.keyword,
      type: f.type,
      department: f.department,
      startDate: f.startDate,
      endDate: f.endDate,
      sort: f.sort,
      isCrossDepartment: f.isCrossDepartment
    });
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
