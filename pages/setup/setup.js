/**
 * 数据库初始化页面
 * 一次性使用：点击按钮创建所有必要的数据库集合
 */
Page({
  data: {
    status: 'ready',    // ready | loading | success | error
    message: '',
    results: null
  },

  async onInit() {
    if (this.data.status === 'loading') return;

    this.setData({ status: 'loading', message: '正在创建数据库集合...', results: null });

    try {
      const res = await wx.cloud.callFunction({ name: 'initDatabase' });
      const data = res.result;

      if (data.code === 0) {
        this.setData({
          status: 'success',
          message: '数据库初始化成功！',
          results: data.data
        });
      } else {
        this.setData({
          status: 'error',
          message: data.message || '初始化失败',
          results: data.data
        });
      }
    } catch (err) {
      console.error('[setup] 初始化失败:', err);
      this.setData({
        status: 'error',
        message: err.errMsg || err.message || '未知错误'
      });
    }
  },

  onBack() {
    wx.navigateBack();
  }
});
