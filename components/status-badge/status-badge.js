/**
 * 状态标签组件
 * 统一展示成员状态（空闲/忙碌/不可用）或任务状态
 */

const app = getApp();

Component({
  properties: {
    /** 状态类型: 'member' 或 'task' */
    type: {
      type: String,
      value: 'member'
    },
    /** 状态值 */
    status: {
      type: String,
      value: '',
      observer: 'updateDisplay'
    },
    /** 是否显示文本 */
    showText: {
      type: Boolean,
      value: true
    },
    /** 尺寸: 'sm' | 'md' | 'lg' */
    size: {
      type: String,
      value: 'md'
    }
  },

  data: {
    label: '',
    color: '',
    bgColor: '',
    dotColor: ''
  },

  lifetimes: {
    attached() {
      this.updateDisplay(this.properties.status);
    }
  },

  methods: {
    /**
     * 根据状态更新显示
     */
    updateDisplay(status) {
      if (!status) return;

      const { type } = this.properties;
      let label = '';
      let color = '#9E9E9E';

      if (type === 'member') {
        const map = app.globalData.memberStatusMap;
        const info = map[status];
        if (info) {
          label = info.label;
          color = info.color;
        }
      } else if (type === 'task') {
        const map = app.globalData.taskStatusMap;
        const info = map[status];
        if (info) {
          label = info.label;
          color = info.color;
        }
      }

      this.setData({
        label,
        color,
        bgColor: `${color}18`,
        dotColor: color
      });
    }
  }
});
