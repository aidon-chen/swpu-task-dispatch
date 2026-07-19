/**
 * 新闻匹配页面
 * 爬取西南石油大学新闻网，使用jieba分词匹配任务相关新闻
 */

const crawlerUtil = require('../../utils/crawler.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 任务ID（从URL参数传入） */
    taskId: '',
    /** 任务标题 */
    taskTitle: '',
    /** 任务时间 */
    taskTime: '',
    /** 新闻列表 */
    newsList: [],
    /** 是否为缓存结果 */
    fromCache: false,
    /** 加载状态 */
    loading: false,
    /** 是否正在爬取 */
    crawling: false,
    /** 是否已登录 */
    isLoggedIn: false
  },

  onLoad(options) {
    this.setData({
      taskId: options.taskId || '',
      taskTitle: decodeURIComponent(options.taskTitle || ''),
      taskTime: options.taskTime || '',
      isLoggedIn: auth.isLoggedIn()
    });

    // 更新导航栏标题
    if (this.data.taskTitle) {
      wx.setNavigationBarTitle({ title: '新闻匹配' });
    }

    // 如果有taskId，自动加载
    if (options.taskId) {
      this.loadNewsMatch();
    }
  },

  /**
   * 加载新闻匹配结果
   */
  async loadNewsMatch() {
    const { taskId, taskTitle, taskTime } = this.data;

    if (!taskId && !taskTitle) {
      wx.showToast({ title: '缺少任务信息', icon: 'none' });
      return;
    }

    this.setData({ loading: true, crawling: true });

    try {
      const res = await crawlerUtil.matchNews(
        taskId || 'manual',
        taskTitle || '查询',
        taskTime || new Date()
      );

      if (res.code === 0 && res.data) {
        this.setData({
          newsList: res.data.newsList || [],
          fromCache: res.data.fromCache || false
        });
      } else {
        wx.showToast({
          title: res.message || '未找到匹配新闻',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('[新闻匹配] 失败:', err);
      wx.showToast({ title: '匹配失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false, crawling: false });
    }
  },

  /**
   * 手动搜索
   */
  onSearch(e) {
    this.setData({ taskTitle: e.detail.value });
  },

  /**
   * 执行手动搜索
   */
  onManualSearch() {
    if (!this.data.taskTitle.trim()) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    this.loadNewsMatch();
  },

  /**
   * 点击新闻打开WebView
   */
  onOpenNews(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    wx.navigateTo({
      url: `/pages/web-view/web-view?url=${encodeURIComponent(url)}`
    });
  },

  /**
   * 复制新闻链接
   */
  onCopyLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
    });
  },

  /**
   * 获取匹配等级信息
   */
  getMatchInfo(score) {
    return crawlerUtil.getMatchLevel(score);
  },

  /**
   * 格式化匹配评分
   */
  formatScore(score) {
    return crawlerUtil.formatMatchScore(score);
  }
});
