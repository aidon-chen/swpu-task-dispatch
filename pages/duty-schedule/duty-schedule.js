/**
 * 值班表/可用性日历页面
 * 主任视图：日历形式展示部门成员可用性矩阵
 * 成员视图：设置每周固定空闲时间段
 */

const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    /** 当前用户 */
    currentUser: null,
    /** 是否为主任 */
    isDirector: false,
    /** 是否为视觉中心主任 */
    isCenterDirector: false,
    /** 当前部门 */
    department: '',
    /** 当前视图模式：calendar（日历）/ list（列表） */
    viewMode: 'calendar',
    /** 当前查看的年份 */
    currentYear: new Date().getFullYear(),
    /** 当前查看的月份（1-12） */
    currentMonth: new Date().getMonth() + 1,
    /** 日历日期网格 */
    calendarDays: [],
    /** 星期头 */
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    /** 部门成员列表 */
    members: [],
    /** 选中查看的成员（主任视图） */
    selectedMemberId: '',
    /** 成员可用性数据 { memberId: { date: status } } */
    availability: {},
    /** 预计算的可视化矩阵（模板友好）：[{ memberId, name, department, editable, cells:[{date,status}] }] */
    matrixRows: [],
    /** 每周固定时间段设置 */
    weeklySchedule: [
      { day: 1, label: '周一', startTime: '', endTime: '', enabled: false },
      { day: 2, label: '周二', startTime: '', endTime: '', enabled: false },
      { day: 3, label: '周三', startTime: '', endTime: '', enabled: false },
      { day: 4, label: '周四', startTime: '', endTime: '', enabled: false },
      { day: 5, label: '周五', startTime: '', endTime: '', enabled: false },
      { day: 6, label: '周六', startTime: '', endTime: '', enabled: false },
      { day: 0, label: '周日', startTime: '', endTime: '', enabled: false }
    ],
    /** 显示设置面板 */
    showSettings: false,
    /** 是否正在加载 */
    loading: false,
    /** 成员状态统计 */
    statusSummary: {
      available: 0,
      busy: 0,
      unavailable: 0,
      total: 0
    },
    /** 本周值班安排（PRD 值班表导入）：[{ weekday, label, rows:[{slot, cells:[{team,names}]}] }] */
    dutyByWeekday: [],
    /** 值班数据加载中 */
    dutyLoading: false,
    /** 导入中 */
    importing: false,
    /** 清理中 */
    cleaning: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;

    const userInfo = auth.getCurrentUser();
    const isDir = auth.isDirector();
    const isCenter = auth.isCenterDirector();

    this.setData({
      currentUser: userInfo,
      isDirector: isDir,
      isCenterDirector: isCenter,
      department: userInfo.department || ''
    });

    this.generateCalendar();
    this.loadData();
    this.loadDutyRecords();
  },

  // ===== 本周值班（PRD 值班表导入）=====

  /**
   * 加载本周值班记录并聚合为展示结构
   */
  async loadDutyRecords() {
    this.setData({ dutyLoading: true });
    try {
      const weekdayLabels = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五' };
      const list = [];
      for (let wd = 1; wd <= 5; wd++) {
        const res = await api.getDutyRecords({ weekday: wd });
        if (res.code === 0 && res.data && res.data.list) {
          list.push(...res.data.list);
        }
      }
      // 聚合：weekday → slot → team → names
      const grid = [];
      for (let wd = 1; wd <= 5; wd++) {
        const dayList = list.filter(r => r.weekday === wd);
        if (dayList.length === 0) continue;
        const slotMap = {};
        dayList.forEach(r => {
          if (!slotMap[r.slot]) slotMap[r.slot] = {};
          if (!slotMap[r.slot][r.team]) slotMap[r.slot][r.team] = [];
          // 同一周几整个学期多日记录，姓名按 slot+team 去重（周模板语义：每周固定人员）
          if (!slotMap[r.slot][r.team].includes(r.name)) {
            slotMap[r.slot][r.team].push(r.name);
          }
        });
        const rows = Object.keys(slotMap).sort().map(slot => ({
          slot,
          cells: Object.keys(slotMap[slot]).map(team => ({
            team,
            names: slotMap[slot][team].join('、')
          }))
        }));
        grid.push({ weekday: wd, label: weekdayLabels[wd], rows });
      }
      this.setData({ dutyByWeekday: grid });
    } catch (err) {
      console.error('[值班表] 加载值班记录失败:', err);
    } finally {
      this.setData({ dutyLoading: false });
    }
  },

  /**
   * 导入值班表（仅视觉中心主任，云端二次校验）
   */
  onImportDuty() {
    wx.showModal({
      title: '导入值班表',
      content: '将导入本学期（2025-2026春季）全部值班安排（约 1400+ 条记录），重复导入自动跳过。确定继续？',
      confirmColor: '#1976D2',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        this.setData({ importing: true });
        try {
          const res = await api.importDutyRecords({ action: 'import' });
          if (res.code === 0) {
            wx.showToast({ title: `导入成功（+${res.data.inserted} 条）`, icon: 'success' });
            this.loadDutyRecords();
          } else {
            wx.showToast({ title: res.message || '导入失败', icon: 'none' });
          }
        } catch (err) {
          console.error('[值班表] 导入失败:', err);
          wx.showToast({ title: '导入失败', icon: 'none' });
        } finally {
          this.setData({ importing: false });
        }
      }
    });
  },

  /**
   * 清空值班记录（重新导入前使用）
   */
  onCleanDuty() {
    wx.showModal({
      title: '清空值班记录',
      content: '将删除全部本学期值班记录（约 1400+ 条），此操作不可撤销。确定继续？',
      confirmColor: '#F44336',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        this.setData({ cleaning: true });
        try {
          const res = await api.importDutyRecords({ action: 'clean' });
          if (res.code === 0) {
            wx.showToast({ title: `已清空 ${res.data.removed} 条`, icon: 'success' });
            this.setData({ dutyByWeekday: [] });
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        } catch (err) {
          console.error('[值班表] 清空失败:', err);
          wx.showToast({ title: '操作失败', icon: 'none' });
        } finally {
          this.setData({ cleaning: false });
        }
      }
    });
  },

  /**
   * 加载数据
   */
  async loadData() {
    this.setData({ loading: true });

    try {
      const res = await api.getDutySchedule({
        department: this.data.department,
        year: this.data.currentYear,
        month: this.data.currentMonth
      });

      if (res.code === 0 && res.data) {
        const members = res.data.members || [];
        const availability = res.data.availability || {};
        const matrixRows = this.computeMatrixRows(members, availability);
        this.setData({
          members,
          availability,
          statusSummary: res.data.summary || this.data.statusSummary,
          matrixRows
        });
      }
    } catch (err) {
      console.error('[值班表] 加载失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 生成日历网格
   */
  generateCalendar() {
    const { currentYear, currentMonth } = this.data;
    const daysInMonth = dateUtil.getDaysInMonth(currentYear, currentMonth);
    const firstDayOfWeek = dateUtil.getFirstDayOfMonth(currentYear, currentMonth);

    const days = [];
    // 前导空白
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ empty: true });
    }
    // 日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayOfWeek = new Date(currentYear, currentMonth - 1, i).getDay();
      days.push({
        day: i,
        date,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: date === dateUtil.formatDate(new Date())
      });
    }

    this.setData({ calendarDays: days });
  },

  /**
   * 上一月
   */
  onPrevMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      currentMonth = 12;
      currentYear--;
    } else {
      currentMonth--;
    }
    this.setData({ currentYear, currentMonth });
    this.generateCalendar();
    this.loadData();
  },

  /**
   * 下一月
   */
  onNextMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 12) {
      currentMonth = 1;
      currentYear++;
    } else {
      currentMonth++;
    }
    this.setData({ currentYear, currentMonth });
    this.generateCalendar();
    this.loadData();
  },

  /**
   * 切换视图
   */
  onToggleView() {
    this.setData({
      viewMode: this.data.viewMode === 'calendar' ? 'list' : 'calendar'
    });
  },

  /**
   * 选择查看的成员
   */
  onSelectMember(e) {
    const memberId = e.currentTarget.dataset.id;
    this.setData({
      selectedMemberId: this.data.selectedMemberId === memberId ? '' : memberId
    });
  },

  /**
   * 显示/隐藏设置面板
   */
  onToggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  /**
   * 切换某天是否启用
   */
  onToggleDay(e) {
    const index = e.currentTarget.dataset.index;
    const weeklySchedule = [...this.data.weeklySchedule];
    weeklySchedule[index].enabled = !weeklySchedule[index].enabled;
    this.setData({ weeklySchedule });
  },

  /**
   * 时间段变更
   */
  onTimeChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const weeklySchedule = [...this.data.weeklySchedule];
    weeklySchedule[index][field] = e.detail.value;
    this.setData({ weeklySchedule });
  },

  /**
   * 保存每周固定时间段
   */
  async onSaveWeeklySchedule() {
    this.setData({ loading: true });

    try {
      const enabledDays = this.data.weeklySchedule
        .filter(d => d.enabled && d.startTime && d.endTime)
        .map(d => ({
          day: d.day,
          startTime: d.startTime,
          endTime: d.endTime
        }));

      const res = await api.updateUserStatus({
        weeklySchedule: enabledDays
      });

      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ showSettings: false });
        this.loadData();
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 由成员列表 + availability 预计算模板可渲染的矩阵
   * @param {Array} members 成员数组
   * @param {Object} availability { memberId: { date: status } }
   * @returns {Array} [{ memberId, name, department, editable, cells:[{date,status}] }]
   */
  computeMatrixRows(members, availability) {
    const nonEmptyDays = this.data.calendarDays.filter(d => !d.empty);
    const currentUserId = this.data.currentUser ? this.data.currentUser._id : '';
    const dept = this.data.department;
    const isCenter = this.data.isCenterDirector;
    const isDir = this.data.isDirector;

    return members.map(m => {
      // 本人可编辑自己；主任可编辑本部门；中心主任可编辑全部
      const editable = isDir && (m._id === currentUserId || isCenter || m.department === dept);
      const cells = nonEmptyDays.map(d => ({
        date: d.date,
        status: (availability[m._id] && availability[m._id][d.date]) || null
      }));
      return {
        memberId: m._id,
        name: m.name,
        department: m.department,
        editable,
        cells
      };
    });
  },

  /**
   * 本地乐观更新某个单元格状态（不触发整页刷新）
   */
  applyCellStatus(memberId, date, status) {
    const availability = { ...this.data.availability };
    if (!availability[memberId]) availability[memberId] = {};
    if (status) {
      availability[memberId][date] = status;
    } else {
      delete availability[memberId][date];
    }
    const matrixRows = this.computeMatrixRows(this.data.members, availability);
    this.setData({ availability, matrixRows });
  },

  /**
   * 点击矩阵单元格：主任可设置当天状态
   */
  async onCellTap(e) {
    const { memberId, date, status } = e.currentTarget.dataset;
    const row = this.data.matrixRows.find(r => r.memberId === memberId);
    if (!row || !row.editable) return;

    const STATUS_LABELS = ['可用', '忙碌', '不可用', '清除'];
    const STATUS_VALUES = ['available', 'busy', 'unavailable', 'clear'];

    wx.showActionSheet({
      itemList: STATUS_LABELS,
      success: async (res) => {
        const newStatus = STATUS_VALUES[res.tapIndex];
        // 乐观更新
        this.applyCellStatus(memberId, date, newStatus === 'clear' ? null : newStatus);

        try {
          const apiRes = await api.updateDutySchedule({ userId: memberId, date, status: newStatus });
          if (apiRes.code !== 0) {
            wx.showToast({ title: apiRes.message || '保存失败', icon: 'none' });
            this.loadData(); // 失败回滚：重新拉取
          }
        } catch (err) {
          wx.showToast({ title: '网络错误，已恢复', icon: 'none' });
          this.loadData();
        }
      }
    });
  },

  /**
   * 转到状态上报页
   */
  onGoStatusReport() {
    wx.navigateTo({ url: '/pages/status-report/status-report' });
  }
});
