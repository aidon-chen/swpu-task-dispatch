/**
 * 自定义 tabBar
 *
 * 职责：
 *   1. 接管底部导航栏渲染（app.json tabBar.custom = true 时启用）。
 *   2. 测试 tab 按测试模式状态动态显隐：
 *      - testMode.getStatus().enabled = true（体验版/开发版且 config enabled）→ 显示 5 个 tab
 *      - enabled = false（正式版 release 强制关闭 / config 归位 false）→ 只渲染 4 个 tab
 */
const testMode = require('../utils/testMode.js');
const auth = require('../utils/auth.js');

const ALL_TABS = [
  {
    pagePath: '/pages/index/index',
    text: '任务',
    iconPath: '/images/tab-task.png',
    selectedIconPath: '/images/tab-task-active.png'
  },
  {
    pagePath: '/pages/duty-schedule/duty-schedule',
    text: '值班表',
    iconPath: '/images/tab-schedule.png',
    selectedIconPath: '/images/tab-schedule-active.png'
  },
  {
    pagePath: '/pages/statistics/statistics',
    text: '统计',
    iconPath: '/images/tab-stats.png',
    selectedIconPath: '/images/tab-stats-active.png'
  },
  {
    pagePath: '/pages/profile/profile',
    text: '我的',
    iconPath: '/images/tab-profile.png',
    selectedIconPath: '/images/tab-profile-active.png'
  },
  {
    pagePath: '/pages/test-tools/test-tools',
    text: '测试',
    iconPath: '/images/tab-test.png',
    selectedIconPath: '/images/tab-test-active.png',
    testOnly: true
  }
];

Component({
  data: {
    /** 当前选中 tab 下标 */
    selected: 0,
    /** 渲染的 tab 列表（按测试模式过滤后） */
    list: []
  },

  lifetimes: {
    attached() {
      // 测试 tab 显隐双条件（任一不满足即隐藏）：
      //   ① 环境非 release（测试版 develop/trial 才显示；正式版自动隐藏）
      //   ② 当前用户是调试员账号（role='debug' / isDebug 标记；普通账号含主任不可见）
      const status = testMode.getStatus();
      const isRelease = status.envVersion === 'release';
      const user = auth.getCurrentUser();
      const isDebug = !!user && (user.role === 'debug' || user.isDebugUser === true || user.isDebug === true);

      this.setData({
        list: (isRelease || !isDebug)
          ? ALL_TABS.filter(function (t) { return !t.testOnly; })
          : ALL_TABS
      });
    }
  },

  methods: {
    /** 切换 tab */
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const path = data.path;
      const index = data.index;

      if (path) {
        wx.switchTab({ url: path });
      }
      this.setData({ selected: index });
    }
  }
});
