/**
 * 小程序内通知工具
 *
 * 采用 notifications 集合 + TabBar 红点方案，无需微信订阅消息授权。
 *
 * 通知触发时机:
 *   创建任务 → task_assigned
 *   取消任务 → task_cancelled
 *   定时扫描 → reminder (任务开始前2h)
 *   自动完结 → task_completed
 *
 * 使用:
 *   const notify = require('../../utils/notification')
 *   await notify.send({ userId, type: 'task_assigned', taskId, content })
 */

/** 通知类型常量 */
const NOTIFY_TYPE = {
  TASK_ASSIGNED:  'task_assigned',
  TASK_CANCELLED: 'task_cancelled',
  REMINDER:       'reminder',
  TASK_COMPLETED: 'task_completed'
}

/** 通知类型中文映射 */
const NOTIFY_LABEL = {
  task_assigned:  '新任务',
  task_cancelled: '任务取消',
  reminder:       '任务提醒',
  task_completed: '任务完成'
}

/**
 * 写入一条通知到 notifications 集合
 * 通常在云函数中调用，前端仅在需要本地补充通知时使用
 *
 * @param {Object} opts
 * @param {string} opts.userId    - 接收者 userId
 * @param {string} opts.taskId    - 关联任务ID（可选）
 * @param {string} opts.type      - 通知类型，取值见 NOTIFY_TYPE
 * @param {string} opts.content   - 通知文本
 * @returns {Promise<Object>}
 */
const send = async ({ userId, taskId, type, content }) => {
  const db = wx.cloud.database()
  const now = new Date()

  return db.collection('notifications').add({
    data: {
      userId,
      taskId: taskId || '',
      type,
      content: content || NOTIFY_LABEL[type] || '',
      isRead: false,
      createdAt: now
    }
  })
}

/**
 * 获取当前用户未读通知数量
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
  if (!userId) return 0

  try {
    const db = wx.cloud.database()
    const res = await db.collection('notifications')
      .where({ userId, isRead: false })
      .count()
    return res.total || 0
  } catch (e) {
    console.error('[通知] 获取未读数失败:', e)
    return 0
  }
}

/**
 * 获取通知列表（分页）
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {number} opts.page     - 页码，从1开始
 * @param {number} opts.pageSize - 每页数量，默认20
 * @returns {Promise<{list: Array, hasMore: boolean}>}
 */
const getList = async ({ userId, page = 1, pageSize = 20 }) => {
  const db = wx.cloud.database()
  const skip = (page - 1) * pageSize

  const res = await db.collection('notifications')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize + 1) // 多取一条判断是否有下一页
    .get()

  const hasMore = res.data.length > pageSize
  const list = hasMore ? res.data.slice(0, pageSize) : res.data

  return { list, hasMore }
}

/**
 * 批量标记通知为已读
 * @param {Array<string>} ids - 通知 _id 列表
 * @returns {Promise<void>}
 */
const markAsRead = async (ids) => {
  if (!ids || ids.length === 0) return

  const db = wx.cloud.database()
  const _ = db.command

  // 云开发一次只能更新一条，逐条更新
  const tasks = ids.map(id =>
    db.collection('notifications').doc(id).update({
      data: { isRead: true }
    })
  )
  await Promise.all(tasks)
}

/**
 * 标记所有通知为已读
 * @param {string} userId
 * @returns {Promise<number>} 更新的条数
 */
const markAllRead = async (userId) => {
  const db = wx.cloud.database()
  const _ = db.command

  // 先查出所有未读通知ID
  const unreadRes = await db.collection('notifications')
    .where({ userId, isRead: false })
    .field({ _id: true })
    .get()

  if (unreadRes.data.length === 0) return 0

  const tasks = unreadRes.data.map(item =>
    db.collection('notifications').doc(item._id).update({
      data: { isRead: true }
    })
  )
  await Promise.all(tasks)
  return unreadRes.data.length
}

/**
 * 更新 TabBar 红点
 * 在 index 页 onShow 时调用
 * @param {number} count - 未读数量
 */
const updateTabBadge = (count) => {
  if (count > 0) {
    const text = count > 99 ? '99+' : String(count)
    wx.setTabBarBadge({ index: 0, text })
  } else {
    wx.removeTabBarBadge({ index: 0 })
  }
}

module.exports = {
  NOTIFY_TYPE,
  NOTIFY_LABEL,
  send,
  getUnreadCount,
  getList,
  markAsRead,
  markAllRead,
  updateTabBadge
}
