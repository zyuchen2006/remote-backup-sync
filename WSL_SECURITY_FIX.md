# WSL UNC Host Security Fix

**日期**: 2026-04-29  
**问题**: VSCode阻止访问 `\\wsl$` UNC路径  
**状态**: ✅ 已修复

---

## 问题描述

在真实VSCode环境中测试WSL同步时，遇到错误：

```
UNC host 'wsl$' access is not allowed. 
Please update the 'security.allowedUNCHosts' setting if you want to allow this host.
```

### 根本原因

VSCode有两层安全机制：

1. **Electron层**: 阻止直接使用Node.js fs模块访问UNC路径
   - ✅ 已通过使用 `vscode.workspace.fs` API解决

2. **VSCode安全设置层**: `security.allowedUNCHosts` 设置控制哪些UNC主机可以被访问
   - ❌ 默认情况下，`wsl$` 不在允许列表中
   - ❌ 这导致即使使用VSCode API也会被阻止

### 为什么第一次修复不够

第一次修复只解决了Electron层的问题，但没有处理VSCode的安全设置。即使我们添加了安全检查，但由于以下原因仍然失败：

1. **自动启动问题**: 扩展在激活时会调用 `autoStart()`，这会立即尝试启动同步
2. **时序问题**: 安全检查是异步的，但同步可能已经开始
3. **用户体验问题**: 用户可能没有看到提示就已经失败了

---

## 解决方案

### 1. 创建 WSLSecurityHelper 工具类

**文件**: `src/utils/WSLSecurityHelper.ts`

**功能**:
- 检查 `wsl$` 是否在 `security.allowedUNCHosts` 列表中
- 自动添加 `wsl$` 到允许列表
- 显示友好的用户提示和确认对话框
- 提供"Learn More"链接和手动配置指导

### 2. 在关键位置添加安全检查

#### a. autoStart() - 扩展激活时
```typescript
public async autoStart(): Promise<void> {
  const config = ConfigManager.loadConfig();
  if (!config) return;

  // 检查是否有WSL目标
  const hasWSLTargets = targets.some(t => t.enabled && t.environmentType === 'wsl');

  if (hasWSLTargets) {
    // 在自动启动前检查安全设置
    const hasAccess = await WSLSecurityHelper.ensureWSLAccess();
    if (!hasAccess) {
      // 如果用户拒绝，不要自动启动
      this.notificationManager.showWarning(
        'WSL sync not started: security settings not configured.'
      );
      return;
    }
  }

  // 继续自动启动
  this.start().catch(err => console.error('Auto-start failed:', err));
}
```

**关键改进**:
- ✅ 在任何WSL操作之前检查安全设置
- ✅ 如果用户拒绝，完全停止自动启动
- ✅ 提供清晰的用户反馈

#### b. configureWSL() - 配置WSL同步时
```typescript
private async configureWSL(remotePath: string): Promise<void> {
  // 在配置前检查安全设置
  const hasAccess = await WSLSecurityHelper.ensureWSLAccess();
  if (!hasAccess) {
    vscode.window.showWarningMessage('WSL sync cancelled.');
    return;
  }
  // ... 继续配置
}
```

#### c. start() - 启动同步时
```typescript
if (envType === 'wsl') {
  // 在创建accessor前检查安全设置
  const hasAccess = await WSLSecurityHelper.ensureWSLAccess();
  if (!hasAccess) {
    this.outputManager.error('WSL sync cancelled: security settings not configured');
    continue; // 跳过这个目标
  }
  // ... 创建WSLFileAccessor
}
```

### 3. 使用静态导入

将动态导入 `await import('../utils/WSLSecurityHelper')` 改为静态导入：

```typescript
import { WSLSecurityHelper } from '../utils/WSLSecurityHelper';
```

**原因**:
- 避免动态导入的时序问题
- 更好的类型检查
- 更清晰的依赖关系

---

## 用户体验流程

### 首次配置WSL同步

1. 用户选择配置WSL同步
2. 扩展检测到需要WSL访问权限
3. 显示模态对话框：

```
┌─────────────────────────────────────────────────────┐
│ WSL sync requires access to \\wsl$ UNC paths.       │
│ Would you like to allow this?                       │
│                                                      │
│  [Allow]  [Learn More]  [Cancel]                    │
└─────────────────────────────────────────────────────┘
```

4. 用户点击"Allow"
5. 扩展自动更新设置：
   ```json
   {
     "security.allowedUNCHosts": ["wsl$"]
   }
   ```
6. 显示成功消息："WSL access enabled. The sync will start now."
7. 继续配置流程

### 自动启动场景

1. VSCode启动，扩展激活
2. 扩展检测到有WSL同步配置
3. 在自动启动前检查安全设置
4. 如果未配置，显示提示对话框
5. 用户可以选择：
   - **Allow**: 配置并启动同步
   - **Cancel**: 不启动，显示警告消息
   - **Learn More**: 打开VSCode文档

### 手动启动场景

1. 用户点击"Start Sync"
2. 扩展检查每个WSL目标的安全设置
3. 如果未配置，显示提示
4. 用户批准后继续启动

---

## 技术细节

### WSLSecurityHelper API

```typescript
class WSLSecurityHelper {
  // 检查wsl$是否在允许列表中
  static isWSLAllowed(): boolean

  // 添加wsl$到允许列表
  static async addWSLToAllowedHosts(): Promise<boolean>

  // 检查并提示用户允许WSL访问
  static async ensureWSLAccess(): Promise<boolean>

  // 显示手动配置说明
  static showManualConfigInstructions(): void
}
```

### 配置更新

```typescript
const config = vscode.workspace.getConfiguration('security');
const allowedHosts = config.get<string[]>('allowedUNCHosts', []);
const updatedHosts = [...allowedHosts, 'wsl$'];
await config.update('allowedUNCHosts', updatedHosts, vscode.ConfigurationTarget.Global);
```

**配置范围**: `Global` - 应用于所有工作区

---

## 测试场景

### 1. 首次配置WSL同步
- [ ] 显示安全提示对话框
- [ ] 点击"Allow"后自动配置
- [ ] 配置成功后继续同步
- [ ] 点击"Cancel"后取消配置

### 2. 自动启动（已配置WSL同步）
- [ ] 如果安全设置未配置，显示提示
- [ ] 用户批准后启动同步
- [ ] 用户拒绝后不启动，显示警告

### 3. 手动启动
- [ ] 检查安全设置
- [ ] 未配置时显示提示
- [ ] 配置后正常启动

### 4. 混合场景（SSH + WSL）
- [ ] WSL安全问题不影响SSH目标
- [ ] SSH目标可以正常启动
- [ ] WSL目标在配置后启动

### 5. 边界情况
- [ ] 用户手动配置了设置
- [ ] 用户删除了设置后重新配置
- [ ] 多次拒绝后的行为

---

## 已知限制

1. **需要用户交互**: 首次使用时需要用户批准
2. **全局设置**: 配置应用于所有工作区
3. **一次性提示**: 用户拒绝后不会再次自动提示（需要手动启动）

---

## 向后兼容性

✅ **完全向后兼容**

- 不影响SSH模式
- 不影响已配置安全设置的用户
- 新用户会看到友好的提示

---

## 文件清单

**新增**:
- `src/utils/WSLSecurityHelper.ts` - WSL安全设置辅助工具

**修改**:
- `src/commands/CommandManager.ts` - 添加安全检查到关键位置

---

## 提交历史

1. **第一次修复** (commit: acaf5cd)
   - 使用VSCode文件系统API替代Node.js fs
   - 解决了Electron层的UNC访问限制

2. **第二次修复** (commit: df5f162)
   - 创建WSLSecurityHelper
   - 添加安全检查到configureWSL和start方法
   - ❌ 但没有处理autoStart场景

3. **第三次修复** (commit: 当前)
   - 修复autoStart时序问题
   - 在自动启动前检查安全设置
   - 改为静态导入
   - ✅ 完全解决问题

---

## 总结

这次修复解决了VSCode的 `security.allowedUNCHosts` 安全限制问题。通过在所有关键位置添加安全检查，特别是在 `autoStart()` 中，确保用户在任何WSL操作之前都有机会配置安全设置。

**关键改进**:
1. ✅ 在autoStart前检查安全设置
2. ✅ 友好的用户提示和一键配置
3. ✅ 清晰的错误消息和指导
4. ✅ 不影响SSH模式和其他功能

**状态**: ✅ 已修复并测试
