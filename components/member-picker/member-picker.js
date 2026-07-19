/**
 * 成员选择器组件
 * 支持搜索、多选、随机抽取功能
 * 用于任务创建时的指派人员选择
 */

const api = require('../../utils/api.js');

Component({
  properties: {
    /** 已选中的成员ID列表 */
    selectedIds: {
      type: Array,
      value: []
    },
    /** 所属部门（用于过滤成员） */
    department: {
      type: String,
      value: ''
    },
    /** 是否显示随机选择按钮 */
    showRandom: {
      type: Boolean,
      value: true
    },
    /** 最大可选人数（0表示不限制） */
    maxCount: {
      type: Number,
      value: 0
    }
  },

  data: {
    /** 所有成员列表 */
    members: [],
    /** 过滤后的成员列表 */
    filteredMembers: [],
    /** 搜索关键词 */
    searchKey: '',
    /** 是否显示随机选择弹窗 */
    showRandomModal: false,
    /** 随机抽取人数 */
    randomCount: 1,
    /** 是否正在加载 */
    loading: false
  },

  lifetimes: {
    attached() {
      this.loadMembers();
    }
  },

  observers: {
    'department'(newVal) {
      if (newVal) {
        this.loadMembers();
      }
    }
  },

  methods: {
    /**
     * 加载成员列表（仅加载可用状态的成员）
     */
    async loadMembers() {
      this.setData({ loading: true });

      try {
        // 通过值班表云函数获取成员及其状态
        const res = await api.getDutySchedule({
          department: this.properties.department,
          onlyAvailable: false
        });

        if (res.code === 0 && res.data && res.data.members) {
          this.setData({
            members: res.data.members,
            filteredMembers: res.data.members
          });
        }
      } catch (err) {
        console.error('[成员选择器] 加载成员失败:', err);
        wx.showToast({ title: '加载成员失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },

    /**
     * 搜索过滤
     */
    onSearch(e) {
      const keyword = e.detail.value.toLowerCase();
      this.setData({ searchKey: keyword });

      const { members } = this.data;
      if (!keyword) {
        this.setData({ filteredMembers: members });
        return;
      }

      const filtered = members.filter(m => {
        return (m.name && m.name.toLowerCase().includes(keyword)) ||
               (m.department && m.department.includes(keyword));
      });
      this.setData({ filteredMembers: filtered });
    },

    /**
     * 切换成员选中状态
     */
    onToggleMember(e) {
      const memberId = e.currentTarget.dataset.id;
      let { selectedIds } = this.data;
      const { maxCount } = this.properties;

      if (selectedIds.includes(memberId)) {
        // 取消选中
        selectedIds = selectedIds.filter(id => id !== memberId);
      } else {
        // 检查上限
        if (maxCount > 0 && selectedIds.length >= maxCount) {
          wx.showToast({ title: `最多选择${maxCount}人`, icon: 'none' });
          return;
        }
        selectedIds = [...selectedIds, memberId];
      }

      this.setData({ selectedIds });
      this.triggerEvent('change', { selectedIds });
    },

    /**
     * 打开随机选择弹窗
     */
    onOpenRandom() {
      // 筛选出可用状态的成员
      const availableCount = this.data.members.filter(m => m.status === 'available').length;
      if (availableCount === 0) {
        wx.showToast({ title: '当前没有可用的成员', icon: 'none' });
        return;
      }

      this.setData({
        showRandomModal: true,
        randomCount: Math.min(1, availableCount)
      });
    },

    /**
     * 关闭随机选择弹窗
     */
    onCloseRandom() {
      this.setData({ showRandomModal: false });
    },

    /**
     * 设置随机抽取人数
     */
    onRandomCountChange(e) {
      const val = parseInt(e.detail.value) || 1;
      const availableCount = this.data.members.filter(m => m.status === 'available').length;
      this.setData({
        randomCount: Math.max(1, Math.min(val, availableCount))
      });
    },

    /**
     * 执行随机选择
     */
    onRandomSelect() {
      const { members, randomCount } = this.data;

      // 只从可用状态的成员中抽取
      const available = members.filter(m => m.status === 'available');

      if (available.length === 0) {
        wx.showToast({ title: '当前没有可用的成员', icon: 'none' });
        return;
      }

      // Fisher-Yates 洗牌算法
      const shuffled = [...available];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const selected = shuffled.slice(0, Math.min(randomCount, shuffled.length));
      const selectedIds = selected.map(m => m._id);

      this.setData({
        selectedIds,
        showRandomModal: false
      });

      this.triggerEvent('change', { selectedIds });

      wx.showToast({
        title: `已随机选择${selectedIds.length}人`,
        icon: 'success'
      });
    },

    /**
     * 清空选择
     */
    onClearAll() {
      this.setData({ selectedIds: [] });
      this.triggerEvent('change', { selectedIds: [] });
    },

    /**
     * 获取成员名称
     */
    getMemberName(memberId) {
      const member = this.data.members.find(m => m._id === memberId);
      return member ? member.name : memberId;
    },

    /**
     * 获取成员状态文本
     */
    getMemberStatus(memberId) {
      const member = this.data.members.find(m => m._id === memberId);
      return member ? member.status : 'unknown';
    }
  }
});
