/**
 * WebView 承载页
 * 用于打开新闻详情等外部链接
 * ⚠️ 注意：web-view 的 src 域名必须在微信公众平台「业务域名」中配置，否则真机无法打开
 */

Page({
  data: {
    url: ''
  },

  onLoad(options) {
    const url = options.url ? decodeURIComponent(options.url) : '';
    if (url) {
      this.setData({ url });
      try {
        const u = new URL(url);
        wx.setNavigationBarTitle({ title: u.hostname || '详情' });
      } catch (e) {
        wx.setNavigationBarTitle({ title: '详情' });
      }
    }
  }
});
