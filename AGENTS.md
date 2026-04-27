# VS Code Extension: Remote Code Sync

Build: `npm run compile` (TypeScript → `out/`)

Dev: `npm run watch` to auto-recompile

Lint: `npm run lint`

Debug: Press F5 in VS Code to launch extension in debug mode

Entry: `src/extension.ts` → `./out/extension.js`

Architecture:
- `src/core/` - Sync engine, SSH, config, scheduler, DB
- `src/commands/` - Command registration
- `src/ui/` - Status bar, output channel
- `src/utils/` - i18n, SSH config reader
- `src/types/` - Type definitions

Commands: `remoteSync.configure`, `remoteSync.start`, `remoteSync.stop`

No test framework configured.

Requires VS Code ^1.80.0

Output dir is `out/`. Source is `src/`.