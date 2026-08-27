/**
 * 测试工具中心（tabBar 第 5 项，仅测试模式启用工具）
 * S1 骨架：状态展示 + 工具卡片结构；S2/S3/S4 逐步激活
 */
const api = require('../../utils/api.js');
const testMode = require('../../utils/testMode.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    /** 测试模式是否开启 */
    isTestMode: false,
    /** 环境版本 develop/trial/release */
    envVersion: '',
    /** 关闭原因（如 release_env_forced_off） */
    statusReason: '',
    /** 测试用户数量选项 */
    userCounts: [3, 6, 12],
    selectedUserCount: 6,
    /** 测试任务数量选项 */
    counts: [5, 12, 20],
    selectedCount: 12,
    /** 操作加载态 */
    actionLoading: false
  },

  onLoad() {
    this.loadStatus();
  },

  onShow() {
    this.loadStatus();
    // 同步自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
  },

  /**
   * 读取测试模式状态
   * 工具可用条件：测试模式开启 && 当前用户是调试员账号（普通账号即使测试模式也只显示占位）
   */
  loadStatus() {
    const status = testMode.getStatus();
    const user = auth.getCurrentUser();
    const isDebug = !!user && (user.role === 'debug' || user.isDebugUser === true || user.isDebug === true);
    this.setData({
      isTestMode: status.enabled && isDebug,
      envVersion: status.envVersion,
      statusReason: status.reason || ''
    });
  },

  /**
   * 选择测试用户数量
   */
  onSelectUserCount(e) {
    this.setData({ selectedUserCount: Number(e.currentTarget.dataset.count) });
  },

  /**
   * 选择测试任务数量
   */
  onSelectCount(e) {
    this.setData({ selectedCount: Number(e.currentTarget.dataset.count) });
  },

  // ===== S2 激活：快速新建测试用户 =====
  async onGenerateUsers() {
    if (this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    try {
      const res = await api.generateTestData({
        action: 'generate_users',
        count: this.data.selectedUserCount
      });
      if (res.code === 0) {
        wx.showToast({ title: `已创建 ${res.data.inserted} 个测试用户`, icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[测试工具] 新建测试用户失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  /**
   * 生成调试员账号（role='debug'）
   * 调试员可独占测试入口、扮演任意角色；用该账号在登录页调试登录
   */
  async onGenerateDebugUser() {
    if (this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    try {
      const res = await api.generateTestData({ action: 'generate_debug_user' });
      if (res.code === 0) {
        wx.showToast({ title: res.message || '调试员账号已就绪', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[测试工具] 生成调试员账号失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  // ===== S3 激活：生成测试任务 =====
  async onGenerate() {
    if (this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    try {
      const res = await api.generateTestData({
        action: 'generate',
        count: this.data.selectedCount
      });
      if (res.code === 0) {
        wx.showToast({ title: `已创建 ${res.data.inserted} 个测试任务`, icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[测试工具] 生成测试任务失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  // ===== S4 激活：清理测试数据 =====
  onClean() {
    wx.showModal({
      title: '确认清理',
      content: '将删除全部带 [测试] 标记的任务与测试用户，真实数据不受影响。确定继续？',
      confirmColor: '#F44336',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        if (this.data.actionLoading) return;
        this.setData({ actionLoading: true });
        try {
          const res = await api.generateTestData({ action: 'clean' });
          if (res.code === 0) {
            wx.showToast({
              title: `已清理 ${res.data.removedTasks} 任务、${res.data.removedUsers} 用户`,
              icon: 'success'
            });
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        } catch (err) {
          console.error('[测试工具] 清理测试数据失败:', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        } finally {
          this.setData({ actionLoading: false });
        }
      }
    });
  }
});
