/**
 * 权限密钥验证页面
 * 独立的密钥验证入口，用于已登录用户升级角色
 */

const api = require('../../utils/api.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    /** 密钥值 */
    keyValue: '',
    /** 是否正在验证 */
    verifying: false,
    /** 验证结果 */
    result: null, // { success: boolean, role: string, roleName: string }
    /** 当前用户信息 */
    currentUser: null
  },

  onLoad() {
    const userInfo = storage.getUserInfo();
    this.setData({ currentUser: userInfo });

    const roleNameMap = {
      member: '普通成员',
      photo_director: '摄影部主任',
      video_director: '视频部主任',
      center_director: '视觉中心主任'
    };

    if (userInfo) {
      this.setData({
        currentRoleName: roleNameMap[userInfo.role] || '未知'
      });
    }
  },

  /**
   * 密钥输入
   */
  onKeyInput(e) {
    this.setData({ keyValue: e.detail.value, result: null });
  },

  /**
   * 验证密钥
   */
  async onVerify() {
    const key = this.data.keyValue.trim();
    if (!key) {
      wx.showToast({ title: '请输入密钥', icon: 'none' });
      return;
    }

    this.setData({ verifying: true, result: null });

    try {
      const res = await api.verifyKey(key);

      const roleNameMap = {
        member: '普通成员',
        photo_director: '摄影部主任',
        video_director: '视频部主任',
        center_director: '视觉中心主任'
      };

      if (res.code === 0) {
        const { role } = res.data;

        // 更新本地用户信息
        const userInfo = storage.getUserInfo();
        userInfo.role = role;
        storage.saveUserInfo(userInfo);

        const app = getApp();
        app.globalData.userInfo = userInfo;

        this.setData({
          verifying: false,
          result: {
            success: true,
            role,
            roleName: roleNameMap[role] || '未知'
          },
          keyValue: ''
        });

        wx.showToast({
          title: '角色升级成功！',
          icon: 'success',
          duration: 2000
        });
      } else {
        this.setData({
          verifying: false,
          result: {
            success: false,
            message: res.message || '密钥无效或已被使用'
          }
        });
      }
    } catch (err) {
      console.error('[密钥验证] 失败:', err);
      this.setData({
        verifying: false,
        result: {
          success: false,
          message: '验证失败，请重试'
        }
      });
    }
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
