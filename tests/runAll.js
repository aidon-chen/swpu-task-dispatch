/**
 * 完整测试套件运行器
 * 运行方式：node tests/runAll.js
 */

const { execSync } = require('child_process');
const path = require('path');

const nodePath = process.argv[0];
const testFiles = [
  'testMode.test.js',
  'debugLogin.test.js',
  'testKeyCloudFunctions.test.js',
  'createTask.test.js',
  'getTemplates.test.js',
  'sendNotification.test.js',
  'scheduleNotify.test.js',
  'getTasks.test.js',
  'updateTask.test.js',
  'login.test.js',
  'initDatabase.test.js',
  'verifyKey.test.js',
  'createLocation.test.js',
  'getLocations.test.js',
  'getDutySchedule.test.js',
  'updateDutySchedule.test.js',
  'updateUserStatus.test.js',
  'getNotifications.test.js',
  'markRead.test.js',
  'generateKey.test.js',
  'crawlNews.test.js',
  'getNewsCache.test.js',
  'getReport.test.js',
  'exportReport.test.js',
  'rateTask.test.js',
  'generateTestData.test.js',
  'importDutyRecords.test.js'
];

let hasFailure = false;

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n========== ${file} ==========`);
  try {
    execSync(`"${nodePath}" "${filePath}"`, { stdio: 'inherit' });
  } catch (err) {
    hasFailure = true;
  }
}

console.log('\n========== 测试套件运行结束 ==========');
if (hasFailure) {
  console.log('❌ 存在失败的测试用例');
  process.exit(1);
} else {
  console.log('✅ 所有测试用例通过');
}
