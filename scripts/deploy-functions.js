/**
 * 云函数批量部署脚本（M10-2）
 * ----------------------------------------------------------------------------
 * 一条命令把云函数部署到指定环境，绝不跨环境。
 *
 * 用法：
 *   node scripts/deploy-functions.js --env test
 *   node scripts/deploy-functions.js --env prod
 *   node scripts/deploy-functions.js --env test --name createTask   # 仅部署单个函数
 *   node scripts/deploy-functions.js --env test --dry-run           # 只打印命令不执行
 *
 * 环境 ID 取自 config/env.ids.js，与小程序运行时使用同一份配置，保证一致。
 *
 * 部署后端（二选一，脚本只负责拼命令并执行）：
 *   1) 默认使用 CloudBase CLI（tcb）：需先 `npm i -g @cloudbase/cli` 并 `tcb login`
 *   2) 可用环境变量 TD_DEPLOY_CMD 覆盖命令模板，占位符：
 *        {name}   云函数目录名
 *        {envId}  目标环境 ID
 *      例如（微信开发者工具 CLI）：
 *        TD_DEPLOY_CMD='"C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat" cloud functions:deploy --name {name} --env {envId}' \
 *        node scripts/deploy-functions.js --env test
 *
 * 安全约束：
 *   - 必须显式传入 --env，禁止“默认部署到 prod/全部环境”。
 *   - 一次只部署到一个环境，脚本内部不会同时连多个环境。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_IDS = require('../config/env.ids.js');

const ROOT = path.join(__dirname, '..');
const FUNC_DIR = path.join(ROOT, 'cloudfunctions');

function parseArgs(argv) {
  const args = { env: null, name: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') args.env = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function listFunctions() {
  return fs.readdirSync(FUNC_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function deployCommand(name, envId) {
  // 允许外部覆盖命令模板
  const tpl = process.env.TD_DEPLOY_CMD ||
    'tcb fn deploy {name} --envId {envId}';
  return tpl
    .replace(/\{name\}/g, name)
    .replace(/\{envId\}/g, envId);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.env || !ENV_IDS[args.env]) {
    console.error('❌ 请通过 --env 指定目标环境：dev | test | prod');
    process.exit(1);
  }

  const envId = ENV_IDS[args.env];
  let functions = listFunctions();
  if (args.name) {
    if (!functions.includes(args.name)) {
      console.error(`❌ 未找到云函数目录：cloudfunctions/${args.name}`);
      process.exit(1);
    }
    functions = [args.name];
  }

  console.log(`\n🚀 目标环境：${args.env}  (envId=${envId})`);
  console.log(`📦 待部署函数：${functions.join(', ')}`);
  if (args.dryRun) console.log('🔍 dry-run 模式：仅打印命令，不实际部署\n');

  const results = { ok: [], fail: [] };

  for (const name of functions) {
    const cmd = deployCommand(name, envId);
    console.log(`\n▶ [${name}] ${cmd}`);
    if (args.dryRun) { results.ok.push(name); continue; }

    try {
      // 在对应函数目录内执行，确保依赖与入口被正确识别
      execSync(cmd, { cwd: path.join(FUNC_DIR, name), stdio: 'inherit' });
      results.ok.push(name);
    } catch (err) {
      results.fail.push(name);
      console.error(`✗ [${name}] 部署失败：${err.message}`);
    }
  }

  console.log('\n──────── 部署结果 ────────');
  console.log(`✅ 成功：${results.ok.length ? results.ok.join(', ') : '无'}`);
  console.log(`❌ 失败：${results.fail.length ? results.fail.join(', ') : '无'}`);

  if (results.fail.length > 0) process.exit(2);
  console.log('\n🎉 全部部署完成。');
}

main();
