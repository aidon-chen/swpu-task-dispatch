/**
 * 日期工具函数
 * 提供日期格式化、学期判断、时间段计算等功能
 */

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期为 YYYY-MM-DD HH:mm
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatDateTime(date) {
  const d = new Date(date);
  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

/**
 * 格式化日期为 HH:mm
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatTime(date) {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 格式化日期为 MM月DD日
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatMonthDay(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 格式化日期为 MM月DD日 HH:mm
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatShortDateTime(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(d)}`;
}

/**
 * 获取当前学期
 * @returns {string} 'spring' | 'autumn'
 */
function getCurrentSemester() {
  const now = new Date();
  const month = now.getMonth() + 1;
  // 春季学期：2月-6月
  if (month >= 2 && month <= 6) {
    return 'spring';
  }
  // 秋季学期：9月-次年1月
  return 'autumn';
}

/**
 * 获取当前学期名称
 * @returns {string} 如 '2024年春季学期'
 */
function getCurrentSemesterName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 2 && month <= 6) {
    return `${year}年春季学期`;
  }
  if (month >= 9) {
    return `${year}年秋季学期`;
  }
  // 1月属于上一年的秋季学期
  return `${year - 1}年秋季学期`;
}

/**
 * 获取学期标识字符串
 * @param {Date|string} date - 日期
 * @returns {string} 如 '2024-spring'
 */
function getSemesterKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 2 && month <= 6) {
    return `${year}-spring`;
  }
  if (month >= 9) {
    return `${year}-autumn`;
  }
  return `${year - 1}-autumn`;
}

/**
 * 计算两个日期之间的天数差
 * @param {Date|string} date1 - 日期1
 * @param {Date|string} date2 - 日期2
 * @returns {number}
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * 判断日期是否在指定天数范围内
 * @param {Date|string} target - 目标日期
 * @param {Date|string} base - 基准日期
 * @param {number} days - 天数范围
 * @returns {boolean}
 */
function isWithinDays(target, base, days) {
  return daysBetween(target, base) <= days;
}

/**
 * 计算时间距今的相对描述
 * @param {Date|string|number} date - 日期
 * @returns {string} 如 '刚刚'、'5分钟前'、'3小时前'、'2天前'
 */
function getRelativeTime(date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return formatDate(date);
}

/**
 * 获取星期几的中文描述
 * @param {Date|string} date - 日期
 * @returns {string}
 */
function getDayOfWeek(date) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const d = new Date(date);
  return days[d.getDay()];
}

/**
 * 获取某月的天数
 * @param {number} year - 年份
 * @param {number} month - 月份(1-12)
 * @returns {number}
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 获取某月第一天是星期几
 * @param {number} year - 年份
 * @param {number} month - 月份(1-12)
 * @returns {number} 0=周日
 */
function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * 获取日期范围的月份数组
 * @param {string} startDate - 开始日期 YYYY-MM-DD
 * @param {string} endDate - 结束日期 YYYY-MM-DD
 * @returns {Array<string>} 月份数组 ['2024-01', '2024-02']
 */
function getMonthsInRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = [];

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  formatMonthDay,
  formatShortDateTime,
  getCurrentSemester,
  getCurrentSemesterName,
  getSemesterKey,
  daysBetween,
  isWithinDays,
  getRelativeTime,
  getDayOfWeek,
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthsInRange
};
