/**
 * 机位详情页面
 * 创建/编辑/查看机位的详细信息
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    /** 是否为创建模式 */
    isCreate: false,
    /** 是否为编辑模式 */
    isEdit: false,
    /** 机位ID */
    locationId: '',
    /** 是否为主任 */
    isDirector: false,
    /** 表单数据 */
    form: {
      name: '',
      description: '',
      notes: '',
      images: [],
      tags: []
    },
    /** 当前标签输入 */
    tagInput: '',
    /** 是否正在提交 */
    submitting: false,
    /** 加载状态 */
    loading: true
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;

    const isCreate = options.mode === 'create';
    const isEdit = options.mode === 'edit';

    this.setData({
      isCreate,
      isEdit,
      locationId: options.id || '',
      isDirector: auth.isDirector()
    });

    if (!isCreate && options.id) {
      this.loadLocationDetail(options.id);
    } else {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载机位详情
   */
  async loadLocationDetail(id) {
    try {
      const res = await api.getLocations({ locationId: id });
      if (res.code === 0 && res.data && res.data.locations) {
        const location = res.data.locations.length ? res.data.locations[0] : res.data.locations;
        if (location) {
          this.setData({
            form: {
              name: location.name || '',
              description: location.description || '',
              notes: location.notes || '',
              images: location.images || [],
              tags: location.tags || []
            }
          });
        }
      }
    } catch (err) {
      wx.showToast({ title: '加载机位失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 名称输入
   */
  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  /**
   * 描述输入
   */
  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  /**
   * 注意事项输入
   */
  onNotesInput(e) {
    this.setData({ 'form.notes': e.detail.value });
  },

  /**
   * 标签输入
   */
  onTagInput(e) {
    this.setData({ tagInput: e.detail.value });
  },

  /**
   * 添加标签
   */
  onAddTag() {
    const tag = this.data.tagInput.trim();
    if (!tag) return;
    if (this.data.form.tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    if (this.data.form.tags.length >= 10) {
      wx.showToast({ title: '最多添加10个标签', icon: 'none' });
      return;
    }

    this.setData({
      'form.tags': [...this.data.form.tags, tag],
      tagInput: ''
    });
  },

  /**
   * 删除标签
   */
  onRemoveTag(e) {
    const index = e.currentTarget.dataset.index;
    const tags = [...this.data.form.tags];
    tags.splice(index, 1);
    this.setData({ 'form.tags': tags });
  },

  /**
   * 选择图片
   */
  onChooseImage() {
    const maxCount = 5 - this.data.form.images.length;
    if (maxCount <= 0) {
      wx.showToast({ title: '最多上传5张图片', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' });
        try {
          const uploadPromises = res.tempFilePaths.map(path => {
            const cloudPath = `location-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
            return wx.cloud.uploadFile({ cloudPath, filePath: path });
          });
          const results = await Promise.all(uploadPromises);
          const fileIds = results.map(r => r.fileID);

          this.setData({
            'form.images': [...this.data.form.images, ...fileIds]
          });
        } catch (err) {
          wx.showToast({ title: '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  /**
   * 删除图片
   */
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.form.images];
    images.splice(index, 1);
    this.setData({ 'form.images': images });
  },

  /**
   * 提交
   */
  async onSubmit() {
    const { name } = this.data.form;
    if (!name.trim()) {
      wx.showToast({ title: '请输入机位名称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      let res;
      if (this.data.isCreate) {
        res = await api.createLocation({
          ...this.data.form,
          name: name.trim(),
          description: this.data.form.description.trim(),
          notes: this.data.form.notes.trim()
        });
      } else {
        res = await api.createLocation({
          action: 'update',
          locationId: this.data.locationId,
          updates: {
            ...this.data.form,
            name: name.trim()
          }
        });
      }

      if (res.code === 0) {
        wx.showToast({
          title: this.data.isCreate ? '机位已创建' : '已更新',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
