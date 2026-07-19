/**
 * 任务派发系统 - 小程序入口
 * 西南石油大学视觉中心（摄影部 + 视频部）
 */

const { getEnv } = require('./config/env')
const storage = require('./utils/storage')
const testMode = require('./utils/testMode')

App({
  /**
   * 小程序启动时执行
   */
  onLaunch(options) {
    // 保存启动参数，供测试模式等运行时参数判断使用
    this.globalData.launchOptions = options || {}

    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    const env = getEnv()
    wx.cloud.init({
      env: env.cloudEnvId,
      traceUser: true
    })

    // 加载全局数据
    this.loadGlobalData()

    // 打印测试模式状态
    console.log('[TEST_MODE] 状态:', testMode.getStatus())

    // 隐私协议检查（微信强制要求）
    this.checkPrivacyAuthorization()
  },

  onShow() {
    // 每次回到前台时刷新未读通知数
    this.refreshUnreadCount()
  },

  /**
   * 加载全局数据
   */
  loadGlobalData() {
    const userInfo = storage.getUserInfo()
    const token = storage.getToken()

    if (userInfo && token) {
      this.globalData.userInfo = userInfo
      this.globalData.isLoggedIn = true
    }
  },

  /**
   * 隐私协议授权检查
   * 微信基础库 2.32.3+ 强制要求
   */
  checkPrivacyAuthorization() {
    if (typeof wx.getPrivacySetting !== 'function') {
      return // 低版本基础库跳过
    }

    wx.getPrivacySetting({
      success: (res) => {
        if (res.needAuthorization) {
          // 用户尚未同意隐私协议 -> 在需要时弹出
          this.globalData.privacyNeedAuth = true
        }
      },
      fail: () => {
        // 静默失败
      }
    })
  },

  /**
   * 刷新未读通知数量并更新TabBar红点
   */
  async refreshUnreadCount() {
    try {
      const db = wx.cloud.database()
      const userInfo = this.globalData.userInfo
      if (!userInfo || !userInfo._id) return

      const res = await db.collection('notifications')
        .where({ userId: userInfo._id, isRead: false })
        .count()

      const count = res.total || 0
      this.globalData.unreadCount = count

      if (count > 0) {
        wx.setTabBarBadge({ index: 0, text: count > 99 ? '99+' : String(count) })
      } else {
        wx.removeTabBarBadge({ index: 0 })
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  },

  /**
   * 全局数据
   */
  globalData: {
    /** 启动参数 */
    launchOptions: {},
    /** 用户信息 */
    userInfo: null,
    /** 是否已登录 */
    isLoggedIn: false,
    /** 用户OpenID */
    openid: '',
    /** 是否需隐私授权 */
    privacyNeedAuth: false,
    /** 未读通知数量 */
    unreadCount: 0,

    /** 角色等级映射 */
    roleLevel: {
      member: 1,
      photo_director: 2,
      video_director: 2,
      center_director: 3
    },

    /** 学期定义 (可被云数据库配置覆盖) */
    semesterMonths: {
      spring: { start: 2, end: 6 },
      autumn: { start: 9, end: 1 }
    },

    /** 部门列表 */
    departments: [
      { value: 'photography', label: '摄影部' },
      { value: 'video', label: '视频部' }
    ],

    /** 任务状态映射 */
    taskStatusMap: {
      pending:    { label: '待确认', color: '#FF9800' },
      confirmed:  { label: '已确认', color: '#2196F3' },
      in_progress:{ label: '进行中', color: '#4CAF50' },
      completed:  { label: '已完成', color: '#9E9E9E' },
      cancelled:  { label: '已取消', color: '#F44336' }
    },

    /** 成员状态映射 */
    memberStatusMap: {
      available:   { label: '空闲',   color: '#4CAF50' },
      busy:        { label: '忙碌',   color: '#FF9800' },
      unavailable: { label: '不可用', color: '#F44336' }
    },

    /** 通知类型 */
    notificationTypes: {
      task_assigned:   '任务指派',
      task_cancelled:  '任务取消',
      reminder:        '任务提醒',
      task_completed:  '任务完成'
    },

    /** API 错误码 (v1.3 新规范) */
    errorCode: {
      SUCCESS: 0,

      // 参数错误 1xxx
      PARAM_MISSING:   1001,
      PARAM_FORMAT:    1002,
      PARAM_INVALID:   1003,

      // 权限错误 2xxx
      NOT_LOGGED_IN:   2001,
      PERMISSION_DENIED: 2002,
      KEY_INVALID:     2003,
      KEY_EXPIRED:     2004,
      CROSS_DEPT:      2005,

      // 数据错误 3xxx
      NOT_FOUND:       3001,
      DATA_CONFLICT:   3002,
      STATUS_INVALID:  3003,

      // 系统错误 4xxx
      SYSTEM_ERROR:    4001,
      DB_ERROR:        4002,
      STORAGE_ERROR:   4003,

      // 爬虫错误 5xxx
      CRAWL_TIMEOUT:   5001,
      CRAWL_PARSE_FAIL: 5002,
      CRAWL_NO_MATCH:  5003
    },

    /** 通用错误提示文案 */
    errorMessages: {
      1001: '请填写必填项',
      1002: '输入格式不正确',
      1003: '输入值不合法',
      2001: '请先登录',
      2002: '你没有权限执行此操作',
      2003: '密钥无效或已被使用',
      2004: '密钥已过期',
      2005: '不能操作其他部门数据',
      3001: '数据不存在或已被删除',
      3002: '数据已存在，请勿重复操作',
      3003: '当前状态不支持此操作',
      4001: '系统繁忙，请稍后重试',
      4002: '数据库操作失败',
      4003: '文件操作失败',
      5001: '网络繁忙，请稍后重试',
      5002: '新闻页面结构变更，暂无法匹配',
      5003: '未找到相关新闻'
    }
  }
})
