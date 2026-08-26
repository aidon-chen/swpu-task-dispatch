/**
 * 密钥生成页面（视觉中心主任专属）
 * 生成一次性正式权限密钥，分发给部门主任 / 成员
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

const ROLE_OPTIONS = [
  { value: 'photo_director', label: '摄影部主任' },
  { value: 'video_director', label: '视频部主任' },
  { value: 'member', label: '普通成员' }
];

const DEPARTMENT_OPTIONS = [
  { value: 'photography', label: '摄影部' },
  { value: 'video', label: '视频部' }
];

Page({
  data: {
    roleOptions: ROLE_OPTIONS,
    departmentOptions: DEPARTMENT_OPTIONS,
    selectedRole: 'photo_director',
    selectedDepartment: 'photography',
    count: 1,
    generatedKeys: [],
    loading: false
  },

  onLoad() {
    if (!auth.requireRole('center_director')) return;
  },

  /**
   * 选择角色
   */
  onSelectRole(e) {
    const role = e.currentTarget.dataset.value;
    this.setData({ selectedRole: role });
  },

  /**
   * 选择部门
   */
  onSelectDepartment(e) {
    const department = e.currentTarget.dataset.value;
    this.setData({ selectedDepartment: department });
  },

  /**
   * 数量变更（支持输入框 bindinput 与 +/− 按钮 data-value）
   */
  onCountInput(e) {
    let v;
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value !== undefined) {
      // 来自 +/− 按钮
      const delta = parseInt(e.currentTarget.dataset.value, 10);
      v = this.data.count + delta;
    } else {
      // 来自输入框
      v = parseInt(e.detail.value, 10);
    }
    if (isNaN(v) || v < 1) v = 1;
    if (v > 10) v = 10;
    this.setData({ count: v });
  },

  /**
   * 生成密钥
   */
  async onGenerate() {
    if (this.data.loading) return;
    const { selectedRole, selectedDepartment, count } = this.data;

    const payload = { role: selectedRole, count };
    if (selectedRole !== 'member') {
      payload.department = selectedDepartment;
    }

    this.setData({ loading: true });
    try {
      const res = await api.generateKey(payload);
      if (res.code === 0 && res.data) {
        const newKeys = res.data.keys || [];
        const generatedKeys = newKeys.concat(this.data.generatedKeys);
        this.setData({ generatedKeys });
        wx.showToast({ title: `已生成 ${newKeys.length} 个密钥`, icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '生成失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 复制单个密钥
   */
  onCopyKey(e) {
    const key = e.currentTarget.dataset.key;
    wx.setClipboardData({
      data: key,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  /**
   * 清空已生成列表
   */
  onClear() {
    this.setData({ generatedKeys: [] });
  }
});
