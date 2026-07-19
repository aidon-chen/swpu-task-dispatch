/**
 * 状态上报页面
 * 成员设置自己当前状态：可用(空闲)/忙碌(已安排任务)/不可用(需说明原因)
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 当前状态 */
    currentStatus: 'available',
    /** 状态选项 */
    statusOptions: [
      { value: 'available', label: '空闲', icon: '✅', desc: '可以接受新任务', color: '#4CAF50' },
      { value: 'busy', label: '忙碌', icon: '⚠️', desc: '已有安排但可能可以协调', color: '#FF9800' },
      { value: 'unavailable', label: '不可用', icon: '❌', desc: '完全无法接受新任务', color: '#F44336' }
    ],
    /** 不可用原因 */
    reason: '',
    /** 原因图片列表 */
    images: [],
    /** 临时不可用时间段 */
    unavailableRange: {
      startDate: '',
      endDate: ''
    },
    /** 是否正在提交 */
    submitting: false,
    /** 当前用户信息 */
    userInfo: null,
    /** 已有的状态记录 */
    statusHistory: []
  },

  onLoad() {
    if (!auth.requireLogin()) return;

    const userInfo = auth.getCurrentUser();
    this.setData({ userInfo });
    this.loadCurrentStatus();
  },

  /**
   * 加载当前状态
   */
  async loadCurrentStatus() {
    try {
      const res = await api.getDutySchedule({ selfOnly: true });
      if (res.code === 0 && res.data) {
        const myStatus = res.data.myStatus;
        if (myStatus) {
          this.setData({
            currentStatus: myStatus.status || 'available',
            reason: myStatus.reason || '',
            images: myStatus.images || [],
            unavailableRange: {
              startDate: myStatus.startDate ? dateUtil.formatDate(myStatus.startDate) : '',
              endDate: myStatus.endDate ? dateUtil.formatDate(myStatus.endDate) : ''
            }
          });
        }

        if (res.data.history) {
          this.setData({ statusHistory: res.data.history });
        }
      }
    } catch (err) {
      console.error('[状态上报] 加载状态失败:', err);
    }
  },

  /**
   * 选择状态
   */
  onSelectStatus(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });

    // 切换为可用/忙碌时清空不可用原因
    if (status !== 'unavailable') {
      this.setData({ reason: '', images: [] });
    }
  },

  /**
   * 原因输入
   */
  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  /**
   * 开始日期选择
   */
  onStartDateChange(e) {
    this.setData({ 'unavailableRange.startDate': e.detail.value });
  },

  /**
   * 结束日期选择
   */
  onEndDateChange(e) {
    this.setData({ 'unavailableRange.endDate': e.detail.value });
  },

  /**
   * 选择图片
   */
  onChooseImage() {
    const maxCount = 3 - this.data.images.length;
    if (maxCount <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 上传到云存储
        this.uploadImages(res.tempFilePaths);
      }
    });
  },

  /**
   * 上传图片到云存储
   */
  async uploadImages(filePaths) {
    wx.showLoading({ title: '上传中...' });

    try {
      const uploadPromises = filePaths.map(path => {
        const cloudPath = `status-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        return wx.cloud.uploadFile({ cloudPath, filePath: path });
      });

      const results = await Promise.all(uploadPromises);
      const fileIds = results.map(r => r.fileID);

      this.setData({
        images: [...this.data.images, ...fileIds]
      });

      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (err) {
      console.error('[状态上报] 上传图片失败:', err);
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 删除图片
   */
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  /**
   * 提交状态
   */
  async onSubmit() {
    const { currentStatus, reason, images, unavailableRange } = this.data;

    // 如果选择"不可用"，需要填写原因
    if (currentStatus === 'unavailable' && !reason.trim()) {
      wx.showToast({ title: '请填写不可用的原因', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const statusData = {
        status: currentStatus,
        reason: currentStatus === 'unavailable' ? reason.trim() : '',
        images: images,
        startDate: unavailableRange.startDate || null,
        endDate: unavailableRange.endDate || null
      };

      const res = await api.updateUserStatus(statusData);

      if (res.code === 0) {
        wx.showToast({
          title: '状态已更新',
          icon: 'success',
          duration: 1500
        });

        // 更新本地状态
        this.loadCurrentStatus();
      } else {
        throw new Error(res.message || '更新失败');
      }
    } catch (err) {
      console.error('[状态上报] 提交失败:', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
