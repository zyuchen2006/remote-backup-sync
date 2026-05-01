# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Remote Backup Sync** — a VS Code extension that performs continuous one-way sync (Remote → Local) of code on Linux SSH servers to Windows, acting as a safety net against remote server failures. Requires VS Code 1.80.0+ on Windows with the Remote-SSH extension.

## Build & Development Commands

```bash
npm run compile        # TypeScript → out/ (development)
npm run watch          # Auto-recompile on save
npm run package        # Webpack production bundle → dist/ (for .vsix packaging)
npm run lint           # ESLint check on src/
```

Press **F5** in VS Code to launch the extension in debug mode.

## Test Commands

```bash
npm test                  # Full suite (unit + integration via mocha)
npm run test:unit         # FileSyncEngine + LocalBackupManager only
npm run test:integration  # Integration tests (60s timeout)
npm run test:e2e          # End-to-end tests (120s timeout)
npm run test:perf         # Performance benchmarks (300s timeout)
```

Tests use **mocha + chai** with `ts-node` for direct TypeScript execution. The test setup file `src/test/test-setup-with-mock.ts` loads VS Code API mocks (`src/test/vscode-mock.ts`) before tests run.

To run a single test file:
```bash
npx mocha --require ts-node/register src/test/FileSyncEngine.test.ts --timeout 30000
```

## Architecture

### Entry Point & Initialization
`src/extension.ts` activates the extension: initializes `ConfigManager`, wires up UI components (StatusBarManager, OutputChannelManager, SyncTreeDataProvider), creates `CommandManager` to register all VS Code commands, then calls `autoStart()` to resume previously configured syncs.

### Core Data Flow
1. **CommandManager** (`src/commands/CommandManager.ts`) — orchestrates all commands; maintains Maps of `projectId → SyncScheduler` and `hostKey → SSHConnectionManager` for connection pooling.
2. **SyncScheduler** (`src/core/SyncScheduler.ts`) — interval-based scheduler per sync target; emits `progress`, `syncComplete`, `syncError` events to drive UI updates.
3. **FileSyncEngine** (`src/core/FileSyncEngine.ts`) — performs the actual diff and file download. Tracks file state by `(mtime, size)` snapshots (not hashing) via `DatabaseManager`.
4. **IFileAccessor / FileAccessorFactory** (`src/core/IFileAccessor.ts`, `FileAccessorFactory.ts`) — plugin interface; currently only `SSHFileAccessor` (via `ssh2`) is active. `WSLFileAccessor` exists but is disabled.
5. **LocalBackupManager** (`src/core/LocalBackupManager.ts`) — creates timestamped backups before overwriting local files; implements the Keep-Only strategy (remote deletions do not propagate locally).

### Key Design Decisions
- **One-way sync only**: Remote → Local. No writes to the remote server.
- **SSH connection pooling**: Keyed by `host:port:username`; connections are shared across targets on the same host.
- **Config persistence**: Sync target configs stored in extension `globalState`; SSH passwords stored in Windows Credential Manager (never on disk).
- **WSL support is disabled**: Code in `WSLFileAccessor.ts`, `WSLSecurityHelper.ts`, and `RemoteEnvironmentDetector.ts` is preserved for future use but not active. Do not re-enable without addressing VSCode Electron UNC path restrictions.
- **Webview UI**: The configuration form is a separate webpack bundle (`src/ui/webview/configForm.ts` → `dist/configForm.js`, web target). Message types shared via `src/ui/webview/types.ts`.

### Internationalization
`src/utils/i18n.ts` supports Chinese (`zh-cn`) and English. All user-facing strings should go through it. Locale files: `locales/en.json`, `locales/zh-cn.json`.

## Build Outputs
| Command | Output | Use |
|---------|--------|-----|
| `compile` | `out/` | Dev/debug (F5) |
| `package` | `dist/` | .vsix packaging |

`tsconfig.json` excludes `src/ui/webview/**` (built separately by webpack) and all `test-*.ts` root-level files.
