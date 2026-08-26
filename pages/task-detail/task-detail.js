/**
 * 任务详情页面
 * 展示任务完整信息、支持操作和交付管理
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 任务ID */
    taskId: '',
    /** 任务详情 */
    task: null,
    /** 加载状态 */
    loading: true,
    /** 当前用户 */
    currentUser: null,
    /** 是否为任务创建者 */
    isCreator: false,
    /** 是否被指派到此任务 */
    isAssigned: false,
    /** 是否为主任 */
    isDirector: false,
    /** 被指派成员详情 */
    assignedMembers: [],
    /** 关联机位信息 */
    locationInfo: null,
    /** 操作状态 */
    actionLoading: false,
    /** 显示提交调整弹窗 */
    showAdjustModal: false,
    /** 调整说明 */
    adjustReason: '',
    /** 显示关联新闻 */
    showNewsSection: false,
    /** 任务平均评分 */
    avgScore: 0,
    /** 评价人数 */
    ratingCount: 0,
    /** 我的评价（{score, comment, createdAt}） */
    myRating: null,
    /** 当前用户是否可评价（已完成且参与/主任） */
    canRate: false,
    /** 显示评价弹窗 */
    showRateModal: false,
    /** 弹窗中选中的评分 */
    rateScore: 0,
    /** 弹窗中输入的评语 */
    rateComment: '',
    /** 星级选择项 */
    rateStars: [1, 2, 3, 4, 5]
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;

    const userInfo = auth.getCurrentUser();
    this.setData({
      taskId: options.id || '',
      currentUser: userInfo,
      isDirector: auth.isDirector()
    });

    if (options.id) {
      this.loadTaskDetail(options.id);
    }
  },

  /**
   * 加载任务详情
   */
  async loadTaskDetail(taskId) {
    this.setData({ loading: true });

    try {
      const res = await api.getTasks({ taskId, includeMembers: true });

      if (res.code === 0 && res.data && res.data.tasks && res.data.tasks.length > 0) {
        const task = res.data.tasks[0];
        const userInfo = this.data.currentUser;

        // 评价相关：本人旧评 + 可评条件（已完成 且 参与人/主任）
        const myRating = task.ratings
          ? (task.ratings.find(r => r.userId === userInfo._id) || null)
          : null;
        const canRate = task.status === 'completed' &&
          (auth.isDirector() || auth.isAssignedToTask(task));

        this.setData({
          task,
          isCreator: auth.isTaskCreator(task),
          isAssigned: auth.isAssignedToTask(task),
          assignedMembers: res.data.members || [],
          locationInfo: res.data.location || null,
          avgScore: task.avgScore || 0,
          ratingCount: task.ratings ? task.ratings.length : 0,
          myRating,
          canRate,
          loading: false
        });

        // 更新导航标题
        wx.setNavigationBarTitle({ title: task.title || '任务详情' });
      } else {
        wx.showToast({ title: '任务不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (err) {
      console.error('[任务详情] 加载失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  /**
   * 确认接受任务
   */
  async onAccept() {
    this.setData({ actionLoading: true });
    try {
      const res = await api.updateTask(this.data.taskId, { status: 'confirmed' });
      if (res.code === 0) {
        wx.showToast({ title: '已确认接受', icon: 'success' });
        this.loadTaskDetail(this.data.taskId);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  /**
   * 标记任务开始
   */
  async onStartTask() {
    this.setData({ actionLoading: true });
    try {
      const res = await api.updateTask(this.data.taskId, { status: 'in_progress' });
      if (res.code === 0) {
        wx.showToast({ title: '任务已开始', icon: 'success' });
        this.loadTaskDetail(this.data.taskId);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  /**
   * 标记完成
   */
  async onComplete() {
    this.setData({ actionLoading: true });
    try {
      const res = await api.updateTask(this.data.taskId, { status: 'completed' });
      if (res.code === 0) {
        wx.showToast({ title: '任务已完成', icon: 'success' });
        this.loadTaskDetail(this.data.taskId);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  /**
   * 取消任务（仅主任）
   */
  async onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个任务吗？此操作不可撤销。',
      confirmColor: '#F44336',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        this.setData({ actionLoading: true });
        try {
          const res = await api.updateTask(this.data.taskId, { status: 'cancelled' });
          if (res.code === 0) {
            wx.showToast({ title: '任务已取消', icon: 'success' });
            this.loadTaskDetail(this.data.taskId);
          } else {
            wx.showToast({ title: res.message, icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        } finally {
          this.setData({ actionLoading: false });
        }
      }
    });
  },

  /**
   * 打开调整交付状态弹窗
   */
  onOpenAdjust() {
    this.setData({ showAdjustModal: true, adjustReason: '' });
  },

  /**
   * 关闭调整弹窗
   */
  onCloseAdjust() {
    this.setData({ showAdjustModal: false, adjustReason: '' });
  },

  /**
   * 调整原因输入
   */
  onAdjustReasonInput(e) {
    this.setData({ adjustReason: e.detail.value });
  },

  /**
   * 提交调整申请
   */
  async onSubmitAdjust() {
    const reason = this.data.adjustReason.trim();
    if (!reason) {
      wx.showToast({ title: '请填写调整原因', icon: 'none' });
      return;
    }

    this.setData({ actionLoading: true });
    try {
      const res = await api.updateTask(this.data.taskId, {
        status: 'pending',
        adjustReason: reason
      });
      if (res.code === 0) {
        wx.showToast({ title: '调整申请已提交', icon: 'success' });
        this.setData({ showAdjustModal: false });
        this.loadTaskDetail(this.data.taskId);
      }
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  },

  /**
   * 编辑任务
   */
  onEdit() {
    wx.navigateTo({
      url: `/pages/create-task/create-task?id=${this.data.taskId}&mode=edit`
    });
  },

  /**
   * 查看新闻匹配
   */
  onViewNews() {
    const { task } = this.data;
    if (!task) return;
    wx.navigateTo({
      url: `/pages/news-match/news-match?taskId=${task._id}&taskTitle=${encodeURIComponent(task.title)}&taskTime=${task.startTime}`
    });
  },

  /**
   * 通过WebView打开新闻
   */
  onOpenNewsUrl(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({
        url: `/pages/web-view/web-view?url=${encodeURIComponent(url)}`
      });
    }
  },

  /**
   * 打开评价弹窗（预填本人旧评）
   */
  onOpenRateModal() {
    const { myRating } = this.data;
    this.setData({
      showRateModal: true,
      rateScore: myRating ? myRating.score : 0,
      rateComment: myRating ? (myRating.comment || '') : ''
    });
  },

  /**
   * 关闭评价弹窗
   */
  onCloseRateModal() {
    this.setData({ showRateModal: false, rateScore: 0, rateComment: '' });
  },

  /**
   * 选择星级
   */
  onRateStarTap(e) {
    this.setData({ rateScore: Number(e.currentTarget.dataset.score) });
  },

  /**
   * 评语输入
   */
  onRateCommentInput(e) {
    this.setData({ rateComment: e.detail.value });
  },

  /**
   * 提交评价
   */
  async onSubmitRate() {
    const { rateScore, rateComment } = this.data;
    if (!rateScore || rateScore < 1 || rateScore > 5) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    this.setData({ actionLoading: true });
    try {
      const res = await api.rateTask({
        taskId: this.data.taskId,
        score: rateScore,
        comment: rateComment.trim()
      });
      if (res.code === 0) {
        wx.showToast({ title: '评价成功', icon: 'success' });
        this.setData({ showRateModal: false });
        this.loadTaskDetail(this.data.taskId);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (err) {
      console.error('[任务详情] 提交评价失败:', err);
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ actionLoading: false });
    }
  }
});
