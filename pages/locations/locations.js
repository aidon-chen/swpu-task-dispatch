/**
 * 机位管理列表页面
 * 主任可添加/编辑/删除机位，所有用户可查看
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    /** 机位列表 */
    locations: [],
    /** 筛选标签 */
    activeTag: '',
    /** 所有标签 */
    allTags: [],
    /** 是否为主任 */
    isDirector: false,
    /** 是否正在加载 */
    loading: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.setData({ isDirector: auth.isDirector() });
  },

  onShow() {
    this.loadLocations();
  },

  /**
   * 加载机位列表
   */
  async loadLocations() {
    this.setData({ loading: true });

    try {
      const res = await api.getLocations({ tag: this.data.activeTag });
      if (res.code === 0 && res.data) {
        const locations = res.data.locations || [];

        // 收集所有标签
        const tagSet = new Set();
        locations.forEach(l => {
          if (l.tags && Array.isArray(l.tags)) {
            l.tags.forEach(t => tagSet.add(t));
          }
        });

        this.setData({
          locations,
          allTags: Array.from(tagSet)
        });
      }
    } catch (err) {
      console.error('[机位] 加载失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 筛选标签
   */
  onFilterTag(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({
      activeTag: this.data.activeTag === tag ? '' : tag
    });
    this.loadLocations();
  },

  /**
   * 查看机位详情
   */
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/location-detail/location-detail?id=${id}` });
  },

  /**
   * 添加新机位
   */
  onAddLocation() {
    if (!auth.isDirector()) {
      wx.showToast({ title: '仅主任可添加机位', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/location-detail/location-detail?mode=create' });
  },

  /**
   * 删除机位
   */
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const location = this.data.locations.find(l => l._id === id);
    if (!location) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除机位"${location.name}"吗？`,
      confirmColor: '#F44336',
      success: async (res) => {
        if (!res.confirm) return;

        try {
          // 通过update类似方式软删除，这里调用云函数处理
          const result = await wx.cloud.callFunction({
            name: 'createLocation',
            data: { action: 'delete', locationId: id }
          });

          if (result.result.code === 0) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadLocations();
          } else {
            wx.showToast({ title: result.result.message || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
