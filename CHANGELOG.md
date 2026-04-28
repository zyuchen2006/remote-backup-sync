# Changelog

All notable changes to the "Remote Backup Sync" extension will be documented in this file.

## [0.1.0] - 2026-04-25

### Added

- Initial release
- Remote-SSH integration for automatic connection detection
- One-way sync from remote to local (remote → local)
- Multi-directory sync support with independent configuration
- Sidebar TreeView for managing sync targets
- Password storage in system keychain (Windows Credential Manager)
- Smart backup system for locally modified files
- Keep-only deletion strategy (remote deletions don't delete local files)
- Per-directory exclude patterns
- Auto-start on VSCode launch
- Real-time sync status in status bar
- Configurable sync interval (default: 60s, min: 10s)
- Configurable backup retention (default: 3, range: 1-10)
- Snapshot-based change detection (mtime + size comparison)
- Timestamped backup naming (YYYYMMDD_HHMMSS format)
- JSON-based persistence for snapshots and history
- Internationalization support (English and Simplified Chinese)
- Output channel for detailed logging
- Error handling with automatic reconnection
- SSH config file integration (~/.ssh/config)
- Support for both private key and password authentication

### Features

#### Core Functionality
- FileSyncEngine: Handles file scanning, change detection, and download
- LocalBackupManager: Creates and manages timestamped backups
- SyncScheduler: Manages periodic sync with configurable intervals
- SSHConnectionManager: Maintains SSH connection with keepalive and auto-reconnect
- DatabaseManager: JSON-based storage for snapshots, history, and backups

#### UI Components
- Status bar with sync status indicators (idle, scanning, syncing, error)
- Sidebar TreeView showing all sync targets with status icons
- Context menu integration (Explorer right-click)
- Inline buttons for start/stop/remove per target
- Quick actions menu from status bar

#### Configuration
- Per-target exclude patterns
- Global settings for sync interval and backup count
- Workspace-level configuration storage (.vscode/sync-config.json)
- SSH connection info auto-detection from environment

### Technical Details

- Extension runs in local UI context (not remote)
- Uses ssh2 library for SFTP operations
- Supports Windows path handling from Linux remote
- Event-driven architecture with EventEmitter
- Graceful error handling and recovery
- Memory-efficient file transfer with streaming

### Known Limitations

- One-way sync only (remote → local)
- Windows local path required
- No conflict resolution (local modifications are backed up)
- No symbolic link support in sync
- Database is JSON-based (not optimized for very large projects)

## [Unreleased]

### Added

- **WSL Support**: Full support for Windows Subsystem for Linux (WSL) environments
  - Automatic WSL environment detection
  - Direct file system access via Windows UNC paths (`\\wsl$\distro\path`)
  - No SSH credentials required for WSL connections
  - Support for multiple WSL distributions
  - Path conversion between Linux and Windows formats
- `clearSnapshots()` method in DatabaseManager for test cleanup

### Fixed

- Fixed Windows UNC path format in WSL file accessor (backslashes instead of forward slashes)
- Fixed exclusion pattern tests to properly test accessor methods
- Fixed Windows compatibility issues in tests (chmod, mtime precision)
- Fixed async timing issues in critical scenarios tests
- Fixed E2E test file residue issue by clearing database snapshots before tests
- Fixed path parameter handling in local modification detection tests

### Technical Improvements

- Added comprehensive test suite for WSL functionality (39 tests)
- Added vscode API mock for testing environment-dependent code
- Improved test isolation and cleanup strategies
- Added ts-node configuration for CommonJS module resolution
- Enhanced error messages in E2E tests for better debugging

### Planned Features

- Backup file tree view with restore functionality
- Sync history viewer
- Performance optimizations for large projects (10000+ files)
- Concurrent download support
- Memory usage monitoring
- CI/CD integration
- VSCode Marketplace publication
