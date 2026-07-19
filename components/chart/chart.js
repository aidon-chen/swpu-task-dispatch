/**
 * 图表组件
 * 封装 wx-charts 库，提供柱状图和饼图支持
 * 需要在小程序中引入 wx-charts 库：https://github.com/xiaolin3303/wx-charts
 * 
 * 使用方法：将 wxcharts-min.js 放入 miniprogram/libs/ 目录
 */

// 引入 wx-charts（需要先安装）
// 如果使用 npm，取消下面注释：
// const wxCharts = require('../../libs/wxcharts-min.js');

let RingChart = null;
let ColumnChart = null;

// 尝试动态引入
try {
  const charts = require('../../libs/wxcharts-min.js');
  RingChart = charts.default ? charts.default : charts;
  ColumnChart = RingChart;
} catch (e) {
  console.warn('[图表组件] wx-charts 未安装，请将 wxcharts-min.js 放入 libs/ 目录');
}

Component({
  properties: {
    /** 图表类型: 'bar' | 'pie' */
    type: {
      type: String,
      value: 'bar'
    },
    /** 图表数据 */
    chartData: {
      type: Object,
      value: {},
      observer: 'renderChart'
    },
    /** 图表标题 */
    title: {
      type: String,
      value: ''
    },
    /** 图表宽度（rpx） */
    width: {
      type: Number,
      value: 680
    },
    /** 图表高度（rpx） */
    height: {
      type: Number,
      value: 400
    }
  },

  data: {
    /** 是否已初始化 */
    initialized: false,
    /** 图表实例 */
    chartInstance: null
  },

  lifetimes: {
    attached() {
      this.setData({ initialized: true });
      this.renderChart(this.properties.chartData);
    },
    detached() {
      // 清理图表实例
      if (this.data.chartInstance) {
        this.data.chartInstance = null;
      }
    }
  },

  methods: {
    /**
     * 渲染图表
     */
    renderChart(data) {
      if (!data || !RingChart || !this.data.initialized) return;

      const { type, title, width, height } = this.properties;
      const pxWidth = this.rpxToPx(width);
      const pxHeight = this.rpxToPx(height);

      // 销毁旧图表
      if (this.data.chartInstance) {
        this.data.chartInstance = null;
      }

      try {
        if (type === 'bar') {
          this.renderBarChart(data, title, pxWidth, pxHeight);
        } else if (type === 'pie') {
          this.renderPieChart(data, title, pxWidth, pxHeight);
        }
      } catch (err) {
        console.error('[图表组件] 渲染失败:', err);
      }
    },

    /**
     * 渲染柱状图
     */
    renderBarChart(data, title, width, height) {
      const { categories, series } = data;
      if (!categories || !series) return;

      const chart = new ColumnChart({
        canvasId: 'chartCanvas',
        type: 'column',
        categories: categories,
        series: series,
        yAxis: {
          title: '',
          min: 0,
          format: (val) => val
        },
        xAxis: {
          disableGrid: true
        },
        extra: {
          column: {
            width: 20
          }
        },
        width: width,
        height: height,
        dataLabel: true,
        title: {
          name: title,
          fontSize: 13,
          color: '#333'
        }
      });

      chart.addEventListener('renderComplete', () => {
        this.setData({ chartInstance: chart });
      });
    },

    /**
     * 渲染饼图
     */
    renderPieChart(data, title, width, height) {
      const { series } = data;
      if (!series) return;

      const chart = new RingChart({
        canvasId: 'chartCanvas',
        type: 'ring',
        series: series,
        width: width,
        height: height,
        dataLabel: true,
        title: {
          name: title,
          fontSize: 13,
          color: '#333'
        },
        extra: {
          ringWidth: 20,
          pie: {
            offsetAngle: 0,
            labelWidth: 15
          }
        }
      });

      chart.addEventListener('renderComplete', () => {
        this.setData({ chartInstance: chart });
      });
    },

    /**
     * rpx转px
     */
    rpxToPx(rpx) {
      const { windowWidth } = wx.getSystemInfoSync();
      return Math.floor(rpx / 750 * windowWidth);
    },

    /**
     * 触摸图表事件
     */
    onChartTouch(e) {
      if (this.data.chartInstance) {
        this.data.chartInstance.scrollStart(e);
      }
    }
  }
});
