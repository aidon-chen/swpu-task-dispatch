/**
 * 创建/编辑任务页面
 * 主任权限：创建新任务或编辑已有任务
 * 支持随机选人、关联机位、跨部门任务
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const storage = require('../../utils/storage.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 是否为编辑模式 */
    isEdit: false,
    /** 任务ID（编辑模式时使用） */
    taskId: '',
    /** 表单数据 */
    form: {
      title: '',
      type: '',
      startTime: '',
      endTime: '',
      location: '',
      contact: '',
      description: '',
      deliverables: '',
      assignedTo: [],
      priority: 'normal',
      isCrossDepartment: false,
      locationId: '',
      /** 是否存为模板（开时免填时间/人员） */
      isTemplate: false,
      /** 模板名称（存为模板时使用） */
      templateName: '',
      /** 从模板创建时记录来源模板ID（提交时回传云端做兜底合并） */
      fromTemplateId: ''
    },
    /** 模板选择弹层状态 */
    showTemplatePicker: false,
    templates: [],
    templateLoading: false,
    /** 已套用模板名称（用于页面提示） */
    appliedTemplateName: '',
    /** 任务类型选项 */
    taskTypes: [
      '会议拍摄', '活动拍摄', '新闻摄影', '视频拍摄',
      '宣传片', '后期制作', '外景拍摄', '采访',
      '航拍', '其他'
    ],
    /** 优先级选项 */
    priorities: [
      { value: 'normal', label: '普通' },
      { value: 'urgent', label: '紧急' }
    ],
    /** 日期时间选择器的索引 */
    typeIndex: -1,
    priorityIndex: 0,
    /** 当前部门 */
    department: '',
    /** 机位列表 */
    locations: [],
    /** 是否正在提交 */
    submitting: false,
    /** 页面是否就绪 */
    ready: false,
    /** 开始时间选择器列数据（年/月/日/时/分） */
    startRange: [],
    /** 开始时间选择器当前索引 */
    startValue: [0, 0, 0, 0, 0],
    /** 结束时间选择器列数据 */
    endRange: [],
    /** 结束时间选择器当前索引 */
    endValue: [0, 0, 0, 0, 0]
  },

  onLoad(options) {
    if (!auth.requireRole('photo_director')) return;

    const userInfo = auth.getCurrentUser();
    const isEdit = options.mode === 'edit' && options.id;

    this.setData({
      department: userInfo ? userInfo.department : '',
      isEdit,
      taskId: options.id || ''
    });

    this.loadLocations();

    if (isEdit && options.id) {
      this.loadTaskDetail(options.id);
    } else {
      // 加载草稿
      const draft = storage.getDraftTask();
      if (draft) {
        this.setData({ form: { ...this.data.form, ...draft } });
      }
      // 初始化时间选择器（需在渲染前准备好 range）
      this.initTimePickers();
      this.setData({ ready: true });
    }
  },

  /**
   * 加载任务详情（编辑模式）
   */
  async loadTaskDetail(taskId) {
    try {
      const res = await api.getTasks({ taskId });
      if (res.code === 0 && res.data && res.data.tasks && res.data.tasks.length > 0) {
        const task = res.data.tasks[0];
        this.setData({
          form: {
            title: task.title || '',
            type: task.type || '',
            startTime: dateUtil.formatDateTime(task.startTime),
            endTime: task.endTime ? dateUtil.formatDateTime(task.endTime) : '',
            location: task.location || '',
            contact: task.contact || '',
            description: task.description || '',
            deliverables: task.deliverables || '',
            assignedTo: task.assignedTo || [],
            priority: task.priority || 'normal',
            isCrossDepartment: task.isCrossDepartment || false,
            locationId: task.locationId || ''
          },
          typeIndex: this.data.taskTypes.indexOf(task.type),
          priorityIndex: task.priority === 'urgent' ? 1 : 0
        });
      }
    } catch (err) {
      console.error('[创建任务] 加载任务详情失败:', err);
      wx.showToast({ title: '加载任务失败', icon: 'none' });
    } finally {
      // 编辑模式下根据已有时间初始化选择器
      this.initTimePickers();
      this.setData({ ready: true });
    }
  },

  /**
   * 加载机位列表
   */
  async loadLocations() {
    try {
      const res = await api.getLocations();
      if (res.code === 0 && res.data) {
        this.setData({ locations: res.data.locations || [] });
      }
    } catch (err) {
      console.error('[创建任务] 加载机位失败:', err);
    }
  },

  /**
   * 标题输入
   */
  onTitleInput(e) {
    // 用户手动修改标题后，脱离已套用的模板来源
    this.setData({
      'form.title': e.detail.value,
      'form.fromTemplateId': '',
      appliedTemplateName: ''
    });
  },

  /**
   * 任务类型选择
   */
  onTypeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      typeIndex: index,
      'form.type': this.data.taskTypes[index]
    });
  },

  /**
   * 优先级选择
   */
  onPriorityChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      priorityIndex: index,
      'form.priority': this.data.priorities[index].value
    });
  },

  /**
   * 构建时间选择器的年/月/时/分列（日列随年月动态变化）
   * 返回 { years, months, hours, minutes } 四个一维数组
   */
  buildBaseRanges() {
    const now = new Date();
    const baseYear = now.getFullYear();
    const years = [];
    for (let i = 0; i <= 1; i++) years.push(`${baseYear + i}年`);
    const months = [];
    for (let i = 1; i <= 12; i++) months.push(`${String(i).padStart(2, '0')}月`);
    const hours = [];
    for (let i = 0; i <= 23; i++) hours.push(`${String(i).padStart(2, '0')}时`);
    const minutes = [];
    for (let i = 0; i < 60; i += 5) minutes.push(`${String(i).padStart(2, '0')}分`);
    return { years, months, hours, minutes };
  },

  /**
   * 获取某年某月的日期列（每月天数不同）
   */
  buildDays(year, month) {
    const daysInMonth = dateUtil.getDaysInMonth(year, month);
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) days.push(`${String(i).padStart(2, '0')}日`);
    return days;
  },

  /**
   * 将 "YYYY-MM-DD HH:mm" 解析为各列索引 [年,月,日,时,分]
   * 解析失败或存在非法值时返回 null
   */
  parseDateTime(str, base) {
    if (!str) return null;
    const [datePart, timePart] = str.split(' ');
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    const days = this.buildDays(y, m);
    const minuteIdx = base.minutes.findIndex((x) => parseInt(x, 10) === mm);
    return [
      base.years.findIndex((x) => parseInt(x, 10) === y),
      base.months.findIndex((x) => parseInt(x, 10) === m),
      days.findIndex((x) => parseInt(x, 10) === d),
      base.hours.findIndex((x) => parseInt(x, 10) === hh),
      minuteIdx < 0 ? 0 : minuteIdx
    ];
  },

  /**
   * 将各列索引格式化为 "YYYY-MM-DD HH:mm"
   */
  formatFromIndices(range, value) {
    const year = parseInt(range[0][value[0]], 10);
    const month = parseInt(range[1][value[1]], 10);
    const day = parseInt(range[2][value[2]], 10);
    const hour = parseInt(range[3][value[3]], 10);
    const minute = parseInt(range[4][value[4]], 10);
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
  },

  /**
   * 初始化开始/结束时间选择器
   * 优先使用 form 中已有时间，否则回退到当前时间作为默认位置
   */
  initTimePickers() {
    const base = this.buildBaseRanges();
    const now = new Date();

    const buildFor = (str) => {
      const target = str ? new Date(str.replace(' ', 'T')) : now;
      const y = target.getFullYear();
      const m = target.getMonth() + 1;
      const days = this.buildDays(y, m);
      const range = [base.years, base.months, days, base.hours, base.minutes];
      let value = str ? this.parseDateTime(str, base) : null;
      if (!value || value.some((i) => i < 0)) {
        const minute = Math.round(target.getMinutes() / 5) * 5;
        value = [
          base.years.findIndex((x) => parseInt(x, 10) === y),
          base.months.findIndex((x) => parseInt(x, 10) === m),
          days.findIndex((x) => parseInt(x, 10) === target.getDate()),
          base.hours.findIndex((x) => parseInt(x, 10) === target.getHours()),
          base.minutes.findIndex((x) => parseInt(x, 10) === minute)
        ];
      }
      return { range, value };
    };

    const start = buildFor(this.data.form.startTime);
    const end = buildFor(this.data.form.endTime);
    this.setData({
      startRange: start.range,
      startValue: start.value,
      endRange: end.range,
      endValue: end.value
    });
  },

  /**
   * 开始时间：滚动年/月列时动态修正日期列（防止出现 2 月 31 日等非法日期）
   */
  onStartTimeColumnChange(e) {
    const { column, value } = e.detail;
    if (column !== 0 && column !== 1) return;
    const startValue = this.data.startValue.slice();
    startValue[column] = value;
    const year = parseInt(this.data.startRange[0][startValue[0]], 10);
    const month = parseInt(this.data.startRange[1][startValue[1]], 10);
    const days = this.buildDays(year, month);
    const startRange = this.data.startRange.slice();
    startRange[2] = days;
    if (startValue[2] >= days.length) startValue[2] = days.length - 1;
    this.setData({ startRange, startValue });
  },

  /**
   * 结束时间：同上，滚动年/月列时动态修正日期列
   */
  onEndTimeColumnChange(e) {
    const { column, value } = e.detail;
    if (column !== 0 && column !== 1) return;
    const endValue = this.data.endValue.slice();
    endValue[column] = value;
    const year = parseInt(this.data.endRange[0][endValue[0]], 10);
    const month = parseInt(this.data.endRange[1][endValue[1]], 10);
    const days = this.buildDays(year, month);
    const endRange = this.data.endRange.slice();
    endRange[2] = days;
    if (endValue[2] >= days.length) endValue[2] = days.length - 1;
    this.setData({ endRange, endValue });
  },

  /**
   * 开始时间选择确认（multiSelector 的 e.detail.value 是索引数组，需格式化为字符串）
   */
  onStartTimeChange(e) {
    const value = e.detail.value;
    const dateStr = this.formatFromIndices(this.data.startRange, value);
    this.setData({ 'form.startTime': dateStr, startValue: value });
  },

  /**
   * 结束时间选择确认
   */
  onEndTimeChange(e) {
    const value = e.detail.value;
    const dateStr = this.formatFromIndices(this.data.endRange, value);
    this.setData({ 'form.endTime': dateStr, endValue: value });
  },

  /**
   * 地点输入
   */
  onLocationInput(e) {
    this.setData({ 'form.location': e.detail.value });
  },

  /**
   * 选择关联机位
   */
  onLocationSelect(e) {
    const locationId = e.currentTarget.dataset.id;
    const location = this.data.locations.find(l => l._id === locationId);
    this.setData({
      'form.locationId': locationId === this.data.form.locationId ? '' : locationId,
      'form.location': location ? location.name : this.data.form.location
    });
  },

  /**
   * 联络人输入
   */
  onContactInput(e) {
    this.setData({ 'form.contact': e.detail.value });
  },

  /**
   * 描述输入
   */
  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  /**
   * 成果描述输入
   */
  onDeliverablesInput(e) {
    this.setData({ 'form.deliverables': e.detail.value });
  },

  /**
   * 成员选择变更
   */
  onMemberChange(e) {
    this.setData({ 'form.assignedTo': e.detail.selectedIds });
  },

  /**
   * 切换跨部门标记
   */
  onToggleCrossDept() {
    this.setData({ 'form.isCrossDepartment': !this.data.form.isCrossDepartment });
  },

  /**
   * 保存草稿
   */
  onSaveDraft() {
    storage.saveDraftTask(this.data.form);
    wx.showToast({ title: '草稿已保存', icon: 'success' });
  },

  /**
   * 表单验证
   * 存为模板时仅校验标题/类型，时间与人选在实例化时填写
   */
  validateForm() {
    const { title, type, startTime, assignedTo, isTemplate } = this.data.form;

    if (!title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return false;
    }
    if (!type) {
      wx.showToast({ title: '请选择任务类型', icon: 'none' });
      return false;
    }
    if (isTemplate) {
      return true;
    }
    if (!startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' });
      return false;
    }
    if (assignedTo.length === 0) {
      wx.showToast({ title: '请选择指派人员', icon: 'none' });
      return false;
    }

    return true;
  },

  /**
   * 提交任务（支持：创建任务 / 存为模板 / 从模板实例化）
   */
  async onSubmit() {
    if (!this.validateForm()) return;

    this.setData({ submitting: true });

    try {
      const form = this.data.form;
      const base = {
        title: form.title.trim(),
        type: form.type,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim(),
        contact: form.contact.trim(),
        description: form.description.trim(),
        deliverables: form.deliverables.trim(),
        assignedTo: form.assignedTo,
        priority: form.priority,
        isCrossDepartment: form.isCrossDepartment,
        locationId: form.locationId,
        fromTemplateId: form.fromTemplateId || ''
      };

      let res;
      if (this.data.isEdit) {
        res = await api.updateTask(this.data.taskId, base);
      } else if (form.isTemplate) {
        res = await api.createTask({
          ...base,
          isTemplate: true,
          templateName: (form.templateName || '').trim() || form.title.trim()
        });
      } else {
        res = await api.createTask(base);
      }

      if (res.code === 0) {
        // 清除草稿
        storage.clearDraftTask();

        const tip = this.data.isEdit
          ? '任务已更新'
          : (form.isTemplate ? '模板已保存' : '任务已创建');
        wx.showToast({ title: tip, icon: 'success', duration: 1500 });

        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, 1500);
      } else {
        throw new Error(res.message || '操作失败');
      }
    } catch (err) {
      console.error('[创建任务] 提交失败:', err);
      wx.showToast({ title: err.message || '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 切换“存为模板”
   */
  onToggleSaveTemplate(e) {
    this.setData({ 'form.isTemplate': !!e.detail.value });
  },

  /**
   * 模板名称输入
   */
  onTemplateNameInput(e) {
    this.setData({ 'form.templateName': e.detail.value });
  },

  /**
   * 打开模板选择弹层并加载模板列表
   */
  async onOpenTemplatePicker() {
    this.setData({ showTemplatePicker: true });
    if (this.data.templates.length === 0) {
      await this.loadTemplates();
    }
  },

  /**
   * 关闭模板选择弹层
   */
  onCloseTemplatePicker() {
    this.setData({ showTemplatePicker: false });
  },

  /**
   * 阻止冒泡（弹层内容区点击不关闭）
   */
  noop() {},

  /**
   * 加载可见模板列表
   */
  async loadTemplates() {
    this.setData({ templateLoading: true });
    try {
      const res = await api.getTemplates();
      if (res.code === 0 && res.data) {
        this.setData({ templates: res.data.templates || [] });
      } else {
        wx.showToast({ title: res.message || '加载模板失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[创建任务] 加载模板失败:', err);
      wx.showToast({ title: '加载模板失败', icon: 'none' });
    } finally {
      this.setData({ templateLoading: false });
    }
  },

  /**
   * 选择模板 → 预填表单（时间/人员留空，由本次实例填写）
   */
  onSelectTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const t = this.data.templates.find(x => x._id === id);
    if (!t) return;

    const form = { ...this.data.form };
    form.title = t.title || '';
    form.type = t.type || '';
    form.location = t.location || '';
    form.contact = t.contact || '';
    form.description = t.description || '';
    form.deliverables = t.deliverables || '';
    form.priority = t.priority || 'normal';
    form.isCrossDepartment = !!t.isCrossDepartment;
    form.locationId = t.locationId || '';
    // 时间/人员每次实例独立，不预填
    form.startTime = '';
    form.endTime = '';
    form.assignedTo = [];
    form.isTemplate = false;
    form.fromTemplateId = t._id;
    form.templateName = '';

    this.setData({
      form,
      typeIndex: this.data.taskTypes.indexOf(t.type),
      priorityIndex: t.priority === 'urgent' ? 1 : 0,
      appliedTemplateName: t.templateName || t.title,
      showTemplatePicker: false
    });
    this.initTimePickers();
  }
});
