/**
 * 自定义导航栏组件
 * 
 * 替代微信原生导航栏，解决华为/HarmonyOS 大字体下标题溢出问题
 * 
 * Props:
 *   - title: String       导航栏标题文字
 *   - backgroundColor: String  背景色，默认 #1976D2
 *   - textColor: String    标题颜色，默认 #FFFFFF
 *   - showBack: Boolean    是否显示返回按钮（默认 false，tab 页面不需要）
 *   - customStyle: String  额外样式
 */
Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    backgroundColor: {
      type: String,
      value: '#1976D2'
    },
    textColor: {
      type: String,
      value: '#FFFFFF'
    },
    showBack: {
      type: Boolean,
      value: false
    },
    customStyle: {
      type: String,
      value: ''
    },
    noPlaceholder: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    menuButtonTop: 0,
    menuButtonHeight: 32,
    // 标题可用宽度（避开胶囊按钮）
    titleWidth: '300rpx'
  },

  lifetimes: {
    attached() {
      this.calcNavBarInfo();
    }
  },

  methods: {
    calcNavBarInfo() {
      try {
        const sysInfo = wx.getSystemInfoSync();
        const statusBarHeight = sysInfo.statusBarHeight || 20;

        // 获取胶囊按钮位置信息
        const menuButton = wx.getMenuButtonBoundingClientRect();
        
        // 导航栏高度 = 胶囊底部距离 + 间距
        // 微信规范：胶囊距顶部间距 = statusBarHeight + 某值
        // 导航栏内容高度 = 胶囊高度 + 上下间距
        const menuButtonTop = menuButton.top;
        const menuButtonHeight = menuButton.height;
        
        // 导航栏底部 = 胶囊底部 + 8px间距
        const navBarBottom = menuButtonTop + menuButtonHeight + 8;
        const navBarHeight = navBarBottom - statusBarHeight;

        // 标题区域要避开胶囊按钮（右侧留出胶囊宽度+间距）
        const screenWidth = sysInfo.screenWidth;
        // 胶囊右侧预留：胶囊右边距 + 胶囊宽度 + 胶囊左边距
        const titleRightOffset = (screenWidth - menuButton.left) + 16;
        // 左侧返回按钮区域预留
        const titleLeftOffset = this.properties.showBack ? 100 : 24;
        const titleWidth = screenWidth - titleLeftOffset - titleRightOffset;

        this.setData({
          statusBarHeight,
          navBarHeight,
          menuButtonTop,
          menuButtonHeight,
          titleWidth: titleWidth > 0 ? titleWidth : 300
        });
      } catch (e) {
        // 降级默认值
        console.warn('[custom-nav-bar] 获取系统信息失败，使用默认值', e);
        this.setData({
          statusBarHeight: 20,
          navBarHeight: 44
        });
      }
    },

    onBack() {
      const pages = getCurrentPages();
      if (pages.length >= 2) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
    }
  }
});
