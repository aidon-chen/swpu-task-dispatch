/**
 * 一键切换测试模式 / 发布模式
 *
 * 用法：
 *   node scripts/switch-mode.js test        # 切到测试模式（13 个开关 enabled=true，自动部署 12 个云函数）
 *   node scripts/switch-mode.js release     # 切到发布模式（13 个开关 enabled=false，自动部署 12 个云函数）
 *   node scripts/switch-mode.js test --no-deploy   # 只改文件，不部署（云端不生效，需手动部署）
 *   node scripts/switch-mode.js release --dry-run  # 只打印将改动的内容，不执行
 *
 * 说明：
 *   - 只切换 enabled 主开关（config/test.js + 12 个云函数 testConfig.js），
 *     不动 allowDebugRoleOverride / features（enabled=false 时会被自动短路，安全）。
 *   - 部署走微信开发者工具 CLI（cli.bat），默认部署全部 12 个带 testConfig 的云函数。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_IDS = require('../config/env.ids.js');

// 13 个开关文件：前端 config + 12 个云函数 testConfig
const SWITCH_FILES = [
  path.join(ROOT, 'config/test.js'),
  ...['generateKey', 'generateTestKey', 'generateTestData', 'updateDutySchedule', 'verifyKey',
    'createTask', 'createLocation', 'getTemplates', 'importDutyRecords', 'exportReport', 'getReport', 'rateTask']
    .map(name => path.join(ROOT, 'cloudfunctions', name, 'testConfig.js')),
];

// 部署用环境 ID（当前 dev/test/prod 共用）
const ENV_ID = ENV_IDS.dev;

// 微信开发者工具 CLI
const CLI_BAT = 'F:/toolapp2/微信web开发者工具/cli.bat';
const APPID = 'wx8fdb0c0acb28ee1a';

function parseArgs(argv) {
  const args = { mode: null, noDeploy: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'test' || a === 'release') args.mode = a;
    else if (a === '--no-deploy') args.noDeploy = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

/**
 * 改写文件的 enabled 字段（保注释，只动值）
 * 注意：必须取「最后一个」匹配——config/test.js 的注释里也有 "enabled: xxx" 字样，
 *       用第一个匹配会误改注释、漏掉真实字段。
 */
function rewriteEnabled(filePath, targetValue) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const pattern = /enabled:\s*(true|false)/g;
  const matches = [...content.matchAll(pattern)];
  if (!matches.length) {
    console.warn(`  ⚠️ 未找到 enabled 字段: ${filePath}`);
    return false;
  }
  const last = matches[matches.length - 1];
  const next = content.slice(0, last.index) + `enabled: ${targetValue}` + content.slice(last.index + last[0].length);
  fs.writeFileSync(filePath, next, 'utf-8');
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    console.error('❌ 请指定模式：node scripts/switch-mode.js test | release');
    console.error('   可选：--no-deploy 跳过云函数部署；--dry-run 只打印不执行');
    process.exit(1);
  }

  const target = args.mode === 'test';
  console.log(`\n=== 切换到【${args.mode === 'test' ? '测试模式' : '发布模式'}】===\n`);

  // 1. 改写 13 个开关
  let changed = 0;
  for (const file of SWITCH_FILES) {
    const rel = path.relative(ROOT, file);
    if (!fs.existsSync(file)) {
      console.warn(`  ⚠️ 文件不存在: ${rel}`);
      continue;
    }
    if (args.dryRun) {
      console.log(`  [dry-run] 将 ${rel} 的 enabled 改为 ${target}`);
      changed++;
      continue;
    }
    if (rewriteEnabled(file, target)) {
      console.log(`  ✓ ${rel} → enabled: ${target}`);
      changed++;
    }
  }
  console.log(`\n共处理 ${changed}/${SWITCH_FILES.length} 个开关文件`);

  // 2. 校验
  if (!args.dryRun) {
    const bad = SWITCH_FILES.filter(f => fs.existsSync(f) && !new RegExp(`enabled: ${target}`).test(fs.readFileSync(f, 'utf-8')));
    if (bad.length > 0) {
      console.error(`\n❌ 校验失败，仍有 ${bad.length} 个文件未切换：`);
      bad.forEach(f => console.error('   ' + path.relative(ROOT, f)));
      process.exit(1);
    }
    console.log('✓ 全部开关切换完成');
  }

  // 3. 部署联动（默认）
  if (args.dryRun) {
    console.log('\n[dry-run] 结束（未执行部署）');
    return;
  }
  if (args.noDeploy) {
    console.warn('\n⚠️ 已跳过部署 —— 云端仍是旧状态，需手动部署 12 个云函数后才生效！');
    console.warn('   部署命令示例：\n' + buildDeployCmd('createTask'));
    return;
  }

  const funcs = SWITCH_FILES
    .filter(f => f.includes('cloudfunctions'))
    .map(f => path.basename(path.dirname(f)));

  console.log(`\n=== 部署 ${funcs.length} 个云函数（${args.mode === 'test' ? '测试' : '发布'}模式）===\n`);
  const cmd = buildDeployCmd(funcs);
  console.log('执行:', cmd.split('\n').join(' ').slice(0, 200), '...\n');
  try {
    const out = execSync(cmd, { stdio: 'inherit', shell: 'cmd' });
    console.log('\n✅ 部署完成');
  } catch (err) {
    console.error('\n❌ 部署失败：', err.message);
    console.error('   可重试，或改用 --no-deploy 仅切文件后手动部署。');
    process.exit(1);
  }
}

/** 组装 cli.bat 部署命令（--paths 传绝对路径） */
function buildDeployCmd(funcs) {
  const paths = (Array.isArray(funcs) ? funcs : [funcs])
    .map(name => `"${path.join(ROOT, 'cloudfunctions', name)}"`)
    .join(' ');
  return `"${CLI_BAT}" cloud functions deploy --env ${ENV_ID} --appid ${APPID} --remote-npm-install --paths ${paths}`;
}

main();
