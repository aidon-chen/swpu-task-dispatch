/**
 * 统计报表页面
 * 成员参与次数统计、图表展示、数据导出
 * 权限：普通成员只看自己，主任看部门，视觉中心主任看全员
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 当前用户 */
    currentUser: null,
    /** 是否为主任 */
    isDirector: false,
    /** 是否为视觉中心主任 */
    isCenterDirector: false,
    /** 筛选条件 */
    filter: {
      period: 'semester', // 'month' | 'semester' | 'custom'
      startDate: '',
      endDate: '',
      semester: dateUtil.getCurrentSemesterName(),
      department: ''
    },
    /** 统计汇总数据 */
    summary: {
      totalTasks: 0,
      completedTasks: 0,
      totalHours: 0,
      avgPerPerson: 0,
      avgScore: 0
    },
    /** 图表数据 */
    chartData: null,
    /** 详细列表 */
    detailList: [],
    /** 是否为图表视图 */
    showChart: true,
    /** 加载状态 */
    loading: false,
    /** 学期选项 */
    semesters: [],
    /** 时段选项 */
    periodOptions: [
      { value: 'month', label: '本月' },
      { value: 'semester', label: '本学期' },
      { value: 'custom', label: '自定义' }
    ]
  },

  onLoad() {
    if (!auth.requireLogin()) return;

    const userInfo = auth.getCurrentUser();
    const dept = userInfo ? userInfo.department : '';

    // 生成学期列表
    const semesters = this.generateSemesterList();

    this.setData({
      currentUser: userInfo,
      isDirector: auth.isDirector(),
      isCenterDirector: auth.isCenterDirector(),
      'filter.department': dept,
      semesters
    });

    this.loadReport();
  },

  onShow() {
    // 同步自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  /**
   * 生成学期列表
   */
  generateSemesterList() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const list = [];

    for (let i = 0; i >= -2; i--) {
      const year = currentYear + i;
      list.push(`${year}年春季学期`, `${year}年秋季学期`);
    }

    return list;
  },

  /**
   * 加载报表数据
   */
  async loadReport() {
    this.setData({ loading: true });

    try {
      const res = await api.getReport({
        period: this.data.filter.period,
        startDate: this.data.filter.startDate,
        endDate: this.data.filter.endDate,
        semester: this.data.filter.semester,
        department: this.data.filter.department
      });

      if (res.code === 0 && res.data) {
        const detail = (res.data.detailList || []).map(d => ({ ...d }));
        const maxTotal = detail.reduce((m, d) => Math.max(m, d.total || 0), 0);
        detail.forEach(d => {
          d.barPercent = maxTotal > 0 ? Math.round((d.total / maxTotal) * 100) : 0;
        });
        this.setData({
          summary: res.data.summary || this.data.summary,
          detailList: detail
        });
      }
    } catch (err) {
      console.error('[统计] 加载报表失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 时段切换
   */
  onPeriodChange(e) {
    const period = e.currentTarget.dataset.period;
    const patch = { 'filter.period': period };

    // 首次进入自定义周期：自动填充默认日期（近 30 天 ~ 今天），
    // 避免空值导致 picker 显示/点击异常，同时保证筛选立即生效
    if (period === 'custom') {
      if (!this.data.filter.startDate || !this.data.filter.endDate) {
        const today = new Date();
        const start = new Date(today.getTime() - 29 * 24 * 3600 * 1000);
        patch['filter.startDate'] = dateUtil.formatDate(start);
        patch['filter.endDate'] = dateUtil.formatDate(today);
      }
    }

    this.setData(patch);
    this.loadReport();
  },

  /**
   * 学期选择
   */
  onSemesterChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ 'filter.semester': this.data.semesters[idx] });
    this.loadReport();
  },

  /**
   * 自定义日期范围
   */
  onStartDateChange(e) {
    const startDate = e.detail.value;
    const patch = { 'filter.startDate': startDate };
    // 只填起始日期：结束日期自动默认截止今天
    if (!this.data.filter.endDate) {
      patch['filter.endDate'] = dateUtil.formatDate(new Date());
    }
    this.setData(patch);
    this.loadReport();
  },

  onEndDateChange(e) {
    const endDate = e.detail.value;
    const patch = { 'filter.endDate': endDate };
    // 只填结束日期：起始日期自动补为同一天（保证区间有效）
    if (!this.data.filter.startDate) {
      patch['filter.startDate'] = endDate;
    }
    this.setData(patch);
    this.loadReport();
  },

  /**
   * picker 点击诊断日志（点中时会在 console 打印，可用于确认点击是否到达 picker）
   */
  onPickerTap(e) {
    const which = e.currentTarget.dataset.which || '?';
    const key = which === 'start' ? 'startDate' : 'endDate';
    console.log('[统计] picker 点击:', which, '| value:', this.data.filter[key]);
  },

  /**
   * 切换图表/列表视图
   */
  onToggleView() {
    this.setData({ showChart: !this.data.showChart });
  },

  /**
   * 导出报表
   */
  async onExport() {
    wx.showLoading({ title: '生成报表...' });

    try {
      const res = await api.exportReport({
        period: this.data.filter.period,
        startDate: this.data.filter.startDate,
        endDate: this.data.filter.endDate,
        semester: this.data.filter.semester,
        department: this.data.filter.department
      });

      if (res.code === 0 && res.data && res.data.text) {
        wx.setClipboardData({
          data: res.data.text,
          success: () => {
            wx.showToast({ title: '报表已复制', icon: 'success' });
          }
        });
      } else {
        wx.showToast({ title: res.message || '导出失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[统计] 导出失败:', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
