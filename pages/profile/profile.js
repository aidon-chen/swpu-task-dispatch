/**
 * 个人中心页面
 * 展示用户信息、角色管理、操作入口
 */

const auth = require('../../utils/auth.js');
const storage = require('../../utils/storage.js');
const notification = require('../../utils/notification.js');

Page({
  data: {
    /** 用户信息 */
    userInfo: null,
    /** 角色名称 */
    roleName: '',
    /** 部门名称 */
    departmentName: '',
    /** 是否为主任 */
    isDirector: false,
    /** 是否为视觉中心主任 */
    isCenterDirector: false,
    /** 未读通知数 */
    unreadCount: 0,
    /** 菜单列表 */
    menus: []
  },

  onShow() {
    this.loadUserInfo();
  },

  /**
   * 加载用户信息并构建菜单
   */
  loadUserInfo() {
    const userInfo = auth.getCurrentUser();
    if (!userInfo) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    const roleNameMap = {
      member: '普通成员',
      photo_director: '摄影部主任',
      video_director: '视频部主任',
      center_director: '视觉中心主任'
    };

    const deptNameMap = {
      photography: '摄影部',
      video: '视频部'
    };

    const isDir = auth.isDirector();
    const isCenter = auth.isCenterDirector();

    // 构建菜单（使用当前未读数）
    const menus = this.buildMenus(isDir, isCenter, this.data.unreadCount);

    this.setData({
      userInfo,
      roleName: roleNameMap[userInfo.role] || '未知',
      departmentName: deptNameMap[userInfo.department] || '未选择',
      isDirector: isDir,
      isCenterDirector: isCenter,
      menus
    });

    // 异步刷新未读红点与菜单角标
    this.refreshMsg();
  },

  /**
   * 拉取未读数：刷新 TabBar 红点 + 菜单角标
   */
  async refreshMsg() {
    const count = await notification.refreshUnreadBadge();
    if (count !== this.data.unreadCount) {
      this.setData({
        unreadCount: count,
        menus: this.buildMenus(auth.isDirector(), auth.isCenterDirector(), count)
      });
    }
  },

  /**
   * 构建菜单
   */
  buildMenus(isDirector, isCenterDirector, unreadCount = 0) {
    const menus = [
      {
        icon: '🔔',
        title: '消息中心',
        desc: unreadCount > 0 ? `您有 ${unreadCount} 条未读通知` : '查看任务通知',
        url: '/pages/messages/messages',
        badge: unreadCount
      },
      {
        icon: '📋',
        title: '我的任务',
        desc: '查看我的任务列表',
        url: '/pages/index/index',
        tab: true
      },
      {
        icon: '📊',
        title: '我的状态',
        desc: '设置当前可用状态',
        url: '/pages/status-report/status-report'
      },
      {
        icon: '📅',
        title: '值班表',
        desc: '值班安排与日程总览',
        url: '/pages/duty-schedule/duty-schedule',
        tab: true
      },
      {
        icon: '📈',
        title: '统计报表',
        desc: '查看任务统计数据',
        url: '/pages/statistics/statistics',
        tab: true
      }
    ];

    // 主任菜单
    if (isDirector) {
      menus.push(
        {
          icon: '➕',
          title: '创建任务',
          desc: '创建新的拍摄任务',
          url: '/pages/create-task/create-task'
        },
        {
          icon: '📍',
          title: '机位管理',
          desc: '管理拍摄机位信息',
          url: '/pages/locations/locations'
        }
      );
    }

    // 视觉中心主任菜单
    if (isCenterDirector) {
      menus.push({
        icon: '🔑',
        title: '生成权限密钥',
        desc: '为主任生成升级密钥',
        url: '/pages/key-generate/key-generate'
      });
    }

    // 通用菜单
    menus.push(
      {
        icon: '🔑',
        title: '权限密钥验证',
        desc: '使用密钥升级角色',
        url: '/pages/key-verify/key-verify'
      },
      {
        icon: '📰',
        title: '新闻匹配查询',
        desc: '查询任务相关新闻网报道',
        url: '/pages/news-match/news-match'
      }
    );

    return menus;
  },

  /**
   * 点击菜单项
   */
  onMenuTap(e) {
    const { url, tab } = e.currentTarget.dataset;

    if (!url) return;

    if (tab) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          storage.clearAll();
          const app = getApp();
          app.globalData.userInfo = null;
          app.globalData.isLoggedIn = false;

          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },

  /**
   * 关于
   */
  onAbout() {
    wx.showModal({
      title: '关于',
      content: '任务派发系统 v1.0\n西南石油大学视觉中心\n摄影部 & 视频部内部使用',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
