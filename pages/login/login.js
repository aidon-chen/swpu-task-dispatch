/**
 * 登录页面
 * 微信授权登录 + 新用户注册 + 部门选择 + 角色管理
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const storage = require('../../utils/storage.js');
const testMode = require('../../utils/testMode.js');

const app = getApp();

Page({
  data: {
    /** 是否正在登录 */
    loading: false,
    /** 是否已获取用户信息 */
    hasUserInfo: false,
    /** 用户昵称 */
    nickName: '',
    /** 用户头像 */
    avatarUrl: '',
    /** 是否为新用户（需要选择部门） */
    isNewUser: false,
    /** 选择的部门 */
    selectedDepartment: '',
    /** 部门列表 */
    departments: [
      { value: 'photography', label: '摄影部', desc: '负责校内活动、新闻摄影拍摄' },
      { value: 'video', label: '视频部', desc: '负责校内视频拍摄与后期制作' }
    ],
    /** 用户角色 */
    role: 'member',
    /** 角色中文名 */
    roleName: '普通成员',
    /** 是否显示密钥输入框 */
    showKeyInput: false,
    /** 密钥值 */
    keyValue: '',
    /** 密钥验证状态 */
    keyVerifying: false,
    /** 测试模式是否开启 */
    isTestMode: false,
    /** 测试模式状态 */
    testModeStatus: null,
    /** 是否展开调试登录面板 */
    showDebugLogin: false,
    /** 可选调试角色列表 */
    debugRoles: [
      { value: 'photo_director', label: '摄影部主任' },
      { value: 'video_director', label: '视频部主任' },
      { value: 'center_director', label: '视觉中心主任' }
    ],
    /** 当前选择的调试角色索引 */
    selectedDebugRole: 0
  },

  onLoad(options) {
    // 检查是否已登录
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    // 检查测试模式状态
    const testModeStatus = testMode.getStatus();
    this.setData({
      isTestMode: testMode.isFeatureOn('debugLogin'),
      testModeStatus
    });

    if (testModeStatus.enabled) {
      console.log('[login] 测试模式已开启，调试登录入口可用');
    }
  },

  /**
   * 获取微信用户信息（新版头像昵称填写）
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  /**
   * 微信授权登录
   */
  async onLogin() {
    // 基础校验
    if (!this.data.nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 0. 确保数据库集合已初始化（首次运行/集合缺失时自动创建）
      try {
        await wx.cloud.callFunction({
          name: 'initDatabase',
          data: {}
        });
      } catch (initErr) {
        // initDatabase 云函数未部署时静默忽略，不影响正常登录
        console.warn('[登录] 数据库初始化跳过:', initErr.errMsg || initErr.message);
      }

      // 1. 获取微信登录凭证
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          nickName: this.data.nickName.trim(),
          avatarUrl: this.data.avatarUrl
        }
      });

      if (loginRes.result.code !== 0) {
        throw new Error(loginRes.result.message || '登录失败');
      }

      const { user, isNew } = loginRes.result.data;

      // 2. 保存用户信息
      storage.saveUserInfo(user);

      if (isNew) {
        // 新用户需要选择部门
        this.setData({
          isNewUser: true,
          hasUserInfo: true,
          loading: false
        });
      } else {
        // 老用户直接进入
        this.handleLoginSuccess(user);
      }
    } catch (err) {
      console.error('[登录] 登录失败:', err);
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  /**
   * 选择部门
   */
  onSelectDepartment(e) {
    const dept = e.currentTarget.dataset.dept;
    this.setData({ selectedDepartment: dept });
  },

  /**
   * 确认注册
   */
  async onConfirmRegister() {
    if (!this.data.selectedDepartment) {
      wx.showToast({ title: '请选择部门', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const userInfo = storage.getUserInfo();

      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'register',
          userId: userInfo._id,
          department: this.data.selectedDepartment,
          nickName: this.data.nickName.trim(),
          avatarUrl: this.data.avatarUrl
        }
      });

      if (res.result.code !== 0) {
        throw new Error(res.result.message || '注册失败');
      }

      // 更新本地用户信息
      const updatedUser = res.result.data;
      storage.saveUserInfo(updatedUser);
      this.handleLoginSuccess(updatedUser);
    } catch (err) {
      console.error('[注册] 注册失败:', err);
      wx.showToast({ title: err.message || '注册失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  /**
   * 登录成功处理
   */
  handleLoginSuccess(user) {
    app.globalData.userInfo = user;
    app.globalData.isLoggedIn = true;
    app.globalData.openid = user._openid || '';

    this.setData({ loading: false });

    wx.showToast({
      title: `欢迎，${user.name || '同学'}`,
      icon: 'success',
      duration: 1500
    });

    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1500);
  },

  /**
   * 显示/隐藏调试登录面板
   */
  onToggleDebugLogin() {
    this.setData({
      showDebugLogin: !this.data.showDebugLogin,
      selectedDebugRole: 'photo_director'
    });
  },

  /**
   * 选择调试角色
   */
  onSelectDebugRole(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({ selectedDebugRole: index });
  },

  /**
   * 调试角色登录
   * 仅修改本地 storage/globalData，不写入数据库 users.role
   */
  async onDebugLogin() {
    if (!testMode.isFeatureOn('debugLogin')) {
      wx.showToast({ title: '调试登录未启用', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 1. 先走正常登录流程获取/创建用户（获取真实 openid 和 _id）
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          nickName: '',
          avatarUrl: ''
        }
      });

      if (loginRes.result.code !== 0) {
        throw new Error(loginRes.result.message || '调试登录失败');
      }

      const { user } = loginRes.result.data;
      const roleIndex = this.data.selectedDebugRole;
      const selectedRole = this.data.debugRoles[roleIndex].value;

      // 2. 本地修改角色（不写入数据库）
      user.role = selectedRole;
      user.isDebugLogin = true; // 标记调试登录，供创建任务/机位时云端信任该角色
      storage.saveUserInfo(user);

      // 3. 更新全局状态
      app.globalData.userInfo = user;
      app.globalData.isLoggedIn = true;
      app.globalData.openid = user._openid || user.openid || '';

      console.log('[TEST_MODE] 调试登录成功，角色:', selectedRole);

      wx.showToast({
        title: `调试登录：${selectedRole}`,
        icon: 'none',
        duration: 2000
      });

      wx.switchTab({ url: '/pages/index/index' });
    } catch (err) {
      console.error('[调试登录] 失败:', err);
      wx.showToast({ title: err.message || '调试登录失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  /**
   * 显示/隐藏密钥输入框
   */
  onToggleKeyInput() {
    this.setData({
      showKeyInput: !this.data.showKeyInput,
      keyValue: ''
    });
  },

  /**
   * 密钥输入
   */
  onKeyInput(e) {
    this.setData({ keyValue: e.detail.value });
  },

  /**
   * 验证权限密钥
   */
  async onVerifyKey() {
    const key = this.data.keyValue.trim();
    if (!key) {
      wx.showToast({ title: '请输入密钥', icon: 'none' });
      return;
    }

    this.setData({ keyVerifying: true });

    try {
      const res = await api.verifyKey(key);

      if (res.code !== 0) {
        throw new Error(res.message || '密钥无效');
      }

      const { role } = res.data;
      const roleNameMap = {
        member: '普通成员',
        photo_director: '摄影部主任',
        video_director: '视频部主任',
        center_director: '视觉中心主任'
      };

      // 更新本地用户信息
      const userInfo = storage.getUserInfo();
      userInfo.role = role;
      storage.saveUserInfo(userInfo);
      app.globalData.userInfo = userInfo;

      this.setData({
        role,
        roleName: roleNameMap[role] || '普通成员',
        keyVerifying: false,
        showKeyInput: false,
        keyValue: ''
      });

      wx.showToast({
        title: `已升级为${roleNameMap[role]}`,
        icon: 'success',
        duration: 2000
      });
    } catch (err) {
      console.error('[密钥验证] 失败:', err);
      wx.showToast({ title: err.message || '密钥验证失败', icon: 'none' });
      this.setData({ keyVerifying: false });
    }
  },

  /**
   * 跳转到单独密钥验证页面
   */
  onGoKeyVerify() {
    wx.navigateTo({ url: '/pages/key-verify/key-verify' });
  }
});
