/**
 * 任务卡片组件
 * 用于在首页列表和统计列表中展示任务摘要信息
 */

const dateUtil = require('../../utils/date.js');
const authUtil = require('../../utils/auth.js');

Component({
  properties: {
    /** 任务数据对象 */
    task: {
      type: Object,
      value: {},
      observer: 'onTaskChange'
    },
    /** 是否显示操作按钮 */
    showActions: {
      type: Boolean,
      value: true
    },
    /** 是否紧凑模式 */
    compact: {
      type: Boolean,
      value: false
    }
  },

  data: {
    /** 任务类型标签 */
    typeLabel: '',
    /** 状态文本 */
    statusLabel: '',
    /** 状态颜色 */
    statusColor: '',
    /** 优先级标签 */
    priorityLabel: '',
    /** 格式化后的开始时间 */
    formattedStartTime: '',
    /** 格式化后的结束时间 */
    formattedEndTime: '',
    /** 是否为主任 */
    isDirector: false
  },

  lifetimes: {
    attached() {
      this.setData({
        isDirector: authUtil.isDirector()
      });
    }
  },

  methods: {
    /**
     * 任务数据变更时更新显示
     */
    onTaskChange(task) {
      if (!task || Object.keys(task).length === 0) return;

      const app = getApp();
      const statusInfo = app.globalData.taskStatusMap[task.status] || {};

      this.setData({
        typeLabel: task.type || '未分类',
        statusLabel: statusInfo.label || '未知',
        statusColor: statusInfo.color || '#9E9E9E',
        priorityLabel: task.priority === 'urgent' ? '紧急' : '',
        formattedStartTime: dateUtil.formatShortDateTime(task.startTime),
        formattedEndTime: task.endTime ? dateUtil.formatShortDateTime(task.endTime) : ''
      });
    },

    /**
     * 点击卡片进入任务详情
     */
    onTapCard() {
      const { task } = this.properties;
      if (!task || !task._id) return;

      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${task._id}`
      });
    },

    /**
     * 编辑任务
     */
    onEdit(e) {
      const { task } = this.properties;
      // 阻止事件冒泡到卡片点击
      e.stopPropagation();

      wx.navigateTo({
        url: `/pages/create-task/create-task?id=${task._id}&mode=edit`
      });
    },

    /**
     * 取消任务
     */
    onCancel(e) {
      e.stopPropagation();
      const { task } = this.properties;

      wx.showModal({
        title: '确认取消',
        content: `确定要取消任务"${task.title}"吗？`,
        confirmColor: '#F44336',
        success: (res) => {
          if (res.confirm) {
            this.triggerEvent('cancel', { taskId: task._id });
          }
        }
      });
    },

    /**
     * 确认接受任务
     */
    onAccept(e) {
      e.stopPropagation();
      const { task } = this.properties;
      this.triggerEvent('accept', { taskId: task._id });
    },

    /**
     * 标记完成
     */
    onComplete(e) {
      e.stopPropagation();
      const { task } = this.properties;
      this.triggerEvent('complete', { taskId: task._id });
    },

    /**
     * 查看新闻匹配
     */
    onViewNews(e) {
      e.stopPropagation();
      const { task } = this.properties;
      wx.navigateTo({
        url: `/pages/news-match/news-match?taskId=${task._id}&taskTitle=${encodeURIComponent(task.title)}&taskTime=${task.startTime}`
      });
    }
  }
});
