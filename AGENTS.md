# VS Code Extension: Remote Code Sync

## Build Commands

- `npm run compile` - TypeScript compile → `out/`
- `npm run watch` - Auto-recompile on changes
- `npm run package` - Webpack production bundle → `dist/` (for .vsix)
- `npm run lint` - ESLint check

## Debug

Press F5 in VS Code to launch extension in debug mode.

## Test Commands

- `npm test` - Full test suite
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests
- `npm run test:wsl` - WSL-specific tests

## Entry Point

- Source: `src/extension.ts`
- Compiled: `out/extension.js` (dev)
- Packaged: `dist/extension.js` (production)

## Architecture

- `src/core/` - Sync engine, SSH, config, scheduler, DB, backup manager
- `src/commands/` - Command registration
- `src/ui/` - Status bar, output channel, tree view, webview
- `src/utils/` - i18n, SSH config reader, WSL helper
- `src/types/` - Type definitions

## Commands

- `remoteSync.configure` - Configure new sync target
- `remoteSync.start` / `remoteSync.stop` - Start/stop all
- `remoteSync.editConfiguration` - Edit target config
- `remoteSync.debugInfo` - Show debug info

## Important Notes

- VS Code ^1.80.0 required
- Uses Windows Credential Manager for SSH passwords
- Tests use mocha + chai (src/test/)
- Webview UI in `src/ui/webview/`
- WSL detection in `src/core/WSLFileAccessor.ts`