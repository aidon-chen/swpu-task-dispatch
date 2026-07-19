# Windows 组件存储损坏修复全过程记录

> 时间跨度：2026年7月5日 — 7月8日  
> 涉及设备：Windows 11 24H2 (Build 26100)  
> 核心问题：CBS 组件仓库元数据损坏导致 WSL/Hyper-V/容器等功能无法启用，进而 Docker Desktop 无法安装

---

## 一、时间线总结

### 7月5日

| 时间 | 事件 | 结果 |
|------|------|------|
| 18:15 | 清理 `C:\$WINDOWS.~BT` 和 `E:\$WINDOWS.~TMP` 临时文件释放磁盘空间 | ✅ 清理成功 |
| 18:21 | 讨论 Windows 更新方法（Windows Update / 安装助手 / 媒体创建工具 / ISO） | — |
| 18:22 | 详解 DISM 和 SFC 命令原理与执行顺序 | — |
| 18:23 | 检查桌面 `fix_windows_components.bat` 脚本内容 | 脚本存在，4步修复流程 |
| 18:24 | `sc query trustedinstaller` 在 PowerShell 中无返回 | 发现 PowerShell 中 `sc` 是 `Set-Content` 别名，需用 `sc.exe` |
| 18:25 | 确认 TrustedInstaller 服务状态为 RUNNING | ✅ 服务正常 |
| 18:26 | 运行 `dism /online /cleanup-image /ScanHealth` | ✅ 未检测到损坏 |
| 18:31 | ScanHealth 完成，报告"未检测到组件存储损坏" | ✅ 通过 |
| 18:49 | 确认系统版本：Windows 11 24H2, Build 26100 | ✅ 已是最新版 |
| 22:10 | 尝试启动 Docker Desktop | ❌ 错误：找不到注册表键 `SOFTWARE\Docker Inc.\Docker Desktop` |
| 22:10 | 检查 WSL 和虚拟机平台功能状态 | ❌ VirtualMachinePlatform 状态为空（未启用） |
| 22:15 | 尝试运行 Docker Desktop Installer | ❌ 报错 "missing package" |
| 22:18 | 尝试安装 WSL2 内核更新包 | ❌ "此更新仅适用于具有 Windows Subsystem for Linux 的计算机" |
| 22:19 | DISM 启用 WSL 功能 | ❌ 错误 14098：组件存储已损坏 |
| 22:27 | 运行 `dism /online /cleanup-image /RestoreHealth` | 运行中（后台） |

### 7月6日

| 时间 | 事件 | 结果 |
|------|------|------|
| 13:43 | 检查 DISM RestoreHealth 运行结果 | ✅ 运行完成，无错误，CBS 损坏标记已清除 |
| 13:47 | 第二轮 RestoreHealth 验证 | ✅ 所有检测项为 0，S_OK |
| 14:00 | 重新尝试启用 WSL 功能 | ❌ 仍然 14098 |
| 14:12 | 检查 CBS 日志，发现损坏已从 3 个扩展到几十个组件 | ❌ HyperV/WSL/容器/远程桌面等部署清单全部损坏 |
| 14:14 | 尝试 StartComponentCleanup /ResetBase | ❌ 错误 0x800f0806：有挂起操作 |
| 14:15 | 建议重启电脑清除挂起操作 | — |
| 15:50 | 重启后重新尝试启用 WSL + VMP | ❌ 仍然 14098，损坏组件清单与之前一致 |
| 17:41 | 分析 CBS 日志：损坏扩展到 40+ 个合并部署清单 | ❌ DISM 软修复彻底失败 |
| 17:44 | 搜索 24H2 ISO 下载方案 | 找到百度网盘资源 |
| 17:48 | 建议方案 A（安装助手升 25H2）或方案 B（下载 24H2 ISO） | 用户选择用已有的 25H2 ISO |
| 17:53 | 挂载 `G:\game\Win11_25H2_China_GGK_Chinese_Simplified_x64.iso` 到 I 盘 | ✅ 挂载成功 |
| 17:54 | 启动 setup.exe /auto upgrade | UAC 被取消（×3） |
| 18:11 | 用户自行运行 setup.exe GUI | ❌ 错误 0x8007042B - 0x2000D：SAFE_OS 阶段 MIGRATE_DATA 失败 |
| 18:22 | 查阅微软官方错误排查页面 | 建议：干净启动后重试 |
| 20:46 | 创建 `clean_boot_upgrade.bat` 和 `restore_boot.bat` | 提供干净启动升级方案 |
| 20:56 | 整理桌面 bat 文件到 `Windows修复工具` 文件夹 | ✅ 整理完成 |

### Windows Update 历史失败记录

| 日期 | 错误码 | 含义 |
|------|--------|------|
| 7月2日 | 0xc1900404 | SAFE_OS 阶段安装失败 |
| 7月3日 | 0xc190020e | 磁盘空间不足 |
| 7月4日 | 0x80246010 | Windows Update 组件损坏 / BITS 服务问题 |
| 7月5日 | 0x80070652 | 有其他安装正在进行 / 待重启 |
| 7月6日 | 0xc1900130 | 驱动或软件不兼容 |
| 7月6日 | 0x8007042B - 0x2000D | SAFE_OS 阶段 MIGRATE_DATA 失败（ISO 升级） |

---

## 二、按问题类型分类详细总结

### 1. 磁盘空间问题

**问题现象：** C 盘空间不足，Windows Update 报 0xc190020e。

**排查过程：**
- 检查发现 `C:\$WINDOWS.~BT`（上次升级残留）和 `E:\$WINDOWS.~TMP` 占用大量空间
- 通过 PowerShell `Remove-Item -Recurse -Force` 清理

**解决方式：** 清理临时文件夹，释放约 39GB 可用空间。

**结果：** ✅ 空间问题解决，但后续发现空间只是表象，真正的问题在组件存储。

---

### 2. PowerShell 命令执行问题

**问题现象：** `sc query trustedinstaller` 和 `dism /online /cleanup-image /ScanHealth` 在 PowerShell 中无任何输出。

**排查过程：**
- 发现 PowerShell 中 `sc` 是 `Set-Content` 的别名，不是 Service Control Manager
- DISM 命令在 PowerShell 中有时会吞掉输出

**解决方式：**
- 使用 `sc.exe`（加 `.exe` 后缀）代替 `sc`
- DISM 命令改在 CMD（命令提示符）中运行，输出更可靠

**结果：** ✅ 命令正常执行，TrustedInstaller 服务状态为 RUNNING。

---

### 3. Docker Desktop 无法启动

**问题现象：** `G:\docker\Docker Desktop.exe` 启动报错 "cannot find registry key SOFTWARE\Docker Inc.\Docker Desktop"。

**排查过程：**
- Docker Desktop 文件夹中只有解压后的程序文件，未通过安装器正式安装
- 缺少注册表项、服务注册、PATH 配置等安装产物
- 前置依赖 WSL2 和虚拟机平台功能未启用

**解决方式：** 需先通过 `Docker Desktop Installer.exe` 正式安装，但安装器要求 WSL 功能先启用。

**结果：** ❌ 卡在 WSL 功能启用步骤（见下方组件存储损坏问题）。

---

### 4. WSL / 虚拟机平台功能无法启用

**问题现象：** `dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart` 报错 14098（组件存储已损坏）。

**排查过程：**
- DISM ScanHealth 报告"未检测到损坏"——但这是假象
- 深入分析 `C:\WINDOWS\Logs\CBS\CBS.log`，发现 SXS 层报出具体损坏组件：

**初始损坏组件（7月5日，3个）：**
1. `HyperV-Networking-merged-Deployment-LanguagePack` (zh-CN, v10.0.26100.4484)
2. `HyperV-Networking-merged-Deployment-LanguagePack` (en-US, v10.0.26100.4484)
3. `Microsoft-Windows-Lxss-Optional-WOW64-merged-Deployment` (v10.0.26100.3775)

**扩展后损坏组件（7月6日，40+个）：**
- HyperV 全系列：KMCL-Host、Compute-Host、Networking、VmBus、Vpci、Storage、DynamicMemory、Chipset、HvSocket、Virtio、VmSerial、Worker、IsolatedVm 等
- 容器相关：Containers-Client-SDN、Containers-Server-HNS、OneCore-Containers
- OneCore：CimFS-UnionFS、Helium、IsolatedUserMode
- 其他：Lxss-Optional-WOW64、RemoteDesktopServices-Base、SecConfig
- 驱动：dual_wvmbusr.inf、dual_wvid.inf、dual_wstorvsp.inf、dual_hvservice.inf

**问题根因：** 组件仓库的"合并部署清单"（merged deployment manifests）元数据损坏。这类损坏不在文件层，而在 CBS/SXS 组件数据库的元数据层，因此 ScanHealth 的文件级扫描无法检测到。

---

### 5. DISM 修复尝试

#### 5.1 RestoreHealth（在线修复）

**命令：** `dism /online /cleanup-image /RestoreHealth`

**结果：**
- 运行完成，无错误（S_OK）
- CBS 损坏标记已清除（"Ensure CBS corruption flag is clear"）
- CSI 元数据修复事务完成（"StoreCorruptionRepair transaction completed"）
- 但重新启用 WSL 功能仍然 14098——**修复无效**

**原因分析：** RestoreHealth 从 Windows Update 下载替换文件，但"合并部署清单"是特殊的元数据条目，不在常规文件替换范围内。

#### 5.2 StartComponentCleanup /ResetBase

**命令：** `dism /online /cleanup-image /StartComponentCleanup /ResetBase`

**结果：**
- ❌ 错误 0x800f0806：操作无法完成，有挂起操作（CBS_E_PENDING）
- 原因：RestoreHealth 留下了未提交的 CBS 事务，加上 `$WINDOWS.~BT` 中的 Windows 升级进程也在占用组件仓库

#### 5.3 重启后重试

**结果：**
- 挂起操作清除后重试 enable-feature
- ❌ 仍然 14098
- CBS 日志显示损坏从 3 个扩展到 40+ 个——修复反而触发了更多损坏暴露

**结论：** DISM 软修复（ScanHealth + RestoreHealth + StartComponentCleanup）无法修复"合并部署清单"级别的元数据损坏。

---

### 6. ISO 原地升级修复

#### 6.1 挂载 25H2 ISO

**ISO 文件：** `G:\game\Win11_25H2_China_GGK_Chinese_Simplified_x64.iso` (6.8GB)

**挂载方式：** PowerShell `Mount-DiskImage` → 挂载到 I 盘

#### 6.2 自动升级（/auto upgrade）

**命令：** `I:\setup.exe /auto upgrade /migratedrivers all /showoobe none /compat IgnoreWarning /telemetry Disable`

**结果：**
- UAC 提示被用户取消（×3 次）
- 改为创建 bat 文件让用户手动以管理员运行

#### 6.3 GUI 手动升级

**操作：** 双击 I:\setup.exe → "不是现在" → "保留个人文件和应用" → 安装

**结果：**
- ❌ 错误 0x8007042B - 0x2000D
- SAFE_OS 阶段（第二次重启后）MIGRATE_DATA 操作失败
- 系统自动回滚到升级前状态

**原因分析：** 升级过程在迁移数据时需要读取组件仓库中的部署清单，但这些清单已损坏，导致迁移失败并回滚。

---

### 7. 微软官方建议

查阅 [微软官方错误排查页面](https://support.microsoft.com/zh-CN/Windows/Deployment/Install-Upgrade/get-help-with-windows-upgrade-and-installation-errors) 后确认：

- 0x80073712 → 建议 RestoreHealth（已尝试，无效）
- 0x8007042B → 建议干净启动后重试
- 0xc190020e → 释放磁盘空间（已解决）

**最终建议方案：**
1. 干净启动（禁用所有非微软服务和启动项）
2. 断开所有外接设备
3. 重新运行 ISO setup.exe 升级

**备选方案（若干净启动仍失败）：**
- **方案 A：** 设置 → 系统 → 恢复 → 重置此电脑 → 保留我的文件（丢失所有软件，保留个人数据）
- **方案 B：** 全新安装（备份所有数据后格盘重装）

---

## 三、关键日志文件位置

| 日志文件 | 路径 | 用途 |
|----------|------|------|
| DISM 日志 | `C:\WINDOWS\Logs\DISM\dism.log` | DISM 命令执行记录 |
| CBS 日志 | `C:\WINDOWS\Logs\CBS\CBS.log` | 组件仓库操作记录（含损坏详情） |
| CBS 持久日志 | `C:\WINDOWS\Logs\CBS\CbsPersist_*.log` | CBS 历史持久化日志 |
| Windows Update 日志 | `C:\WINDOWS\logs\WindowsUpdate\*.etl` | WU 原始日志（ETL 格式） |
| 转换后 WU 日志 | 桌面 `WindowsUpdate.log`（通过 `Get-WindowsUpdateLog` 生成） | 可读的 WU 日志 |
| Setup 错误日志 | `C:\$WINDOWS.~BT\Sources\Panther\setuperr.log` | 升级安装错误记录 |

---

## 四、创建的工具文件

所有工具文件已集中到 `桌面\Windows修复工具\` 文件夹：

| 文件名 | 功能 | 使用方式 |
|--------|------|----------|
| `fix_windows_components.bat` | 4步修复：清理 → SFC → RestoreHealth → 验证 | 右键管理员运行 |
| `fix_with_iso.bat` | 使用 ISO 作为修复源的 DISM 修复 | 右键管理员运行 |
| `fix_dism_iso.bat` | DISM 从 ISO 拉取组件修复 | 右键管理员运行 |
| `dism_restore.bat` | RestoreHealth + ScanHealth 验证 | 右键管理员运行 |
| `enable_wsl.bat` | 启用 WSL + 虚拟机平台功能 | 右键管理员运行 |
| `watch_dism.bat` | 监控 DISM 进度 | 右键管理员运行 |
| `clean_boot_upgrade.bat` | 干净启动配置 + 升级指引 | 右键管理员运行 |
| `restore_boot.bat` | 恢复正常启动模式 | 右键管理员运行 |

---

## 五、结论与待办

### 已确认的事实
1. 组件仓库元数据（merged deployment manifests）深度损坏
2. DISM ScanHealth / RestoreHealth / StartComponentCleanup 均无法修复此级别损坏
3. Windows Update 连续 6 次升级失败，错误码各不相同但根因相同
4. ISO 原地升级在 SAFE_OS 阶段失败，自动回滚

### 待执行的最终方案
1. **优先尝试：** 干净启动 → ISO setup.exe 升级（`clean_boot_upgrade.bat`）
2. **若仍失败：** 重置此电脑（保留文件）
3. **终极方案：** 全新安装 Windows 11

### 修复成功后的后续步骤
1. 启用 WSL 功能：`dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart`
2. 启用虚拟机平台：`dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`
3. 重启电脑
4. 安装 WSL2 内核更新包（`wsl_update_x64.msi`）
5. 运行 Docker Desktop Installer 正式安装
6. 恢复正常启动模式（`restore_boot.bat`）
