# Configuration Guide

## Quick Start

1. **Connect to Remote Server**
   - Use VSCode Remote-SSH to connect to your remote Linux server
   - Open a workspace folder on the remote

2. **Configure Sync Target**
   - Right-click on a folder in Explorer
   - Select "Configure Code Sync to Local"
   - Follow the prompts

## Configuration Options

### SSH Connection

**Host**: SSH server address
- Can be IP address (e.g., `192.168.1.100`)
- Or hostname from `~/.ssh/config` (e.g., `my-server`)
- Auto-detected from `SSH_CONNECTION` environment variable when available

**Port**: SSH port (default: 22)

**Username**: SSH username
- Auto-detected from `~/.ssh/config` if available
- Or from `$USER` environment variable

**Authentication**:
- **Private Key**: Automatically used if found in `~/.ssh/config`
- **Password**: Prompted on first connection, then stored in Windows Credential Manager

### Sync Paths

**Remote Path**: Directory on remote server to sync
- Example: `/home/user/project`
- Must be absolute path

**Local Path**: Windows directory for backup
- Example: `D:\backup\project`
- Must be absolute Windows path
- Directory will be created if it doesn't exist

### Exclude Patterns

Comma-separated glob patterns to exclude from sync:

**Default Patterns**:
```
node_modules/**,.git/**,.vscode/**,*.log,*.tmp
```

**Custom Patterns** (per directory):
- `*.pyc` - Exclude Python bytecode
- `__pycache__/**` - Exclude Python cache
- `target/**` - Exclude Rust/Java build output
- `dist/**,build/**` - Exclude build directories
- `.env` - Exclude environment files

**Pattern Syntax** (Glob Format):
- `*` - Matches any characters except `/` (single directory level)
  - Example: `*.log` matches `error.log` but not `logs/error.log`
- `**` - Matches any characters including `/` (multiple directory levels)
  - Example: `**/*.log` matches `error.log` and `logs/error.log`
- `?` - Matches single character
- `[abc]` - Matches any character in brackets

**Important**: Use `**` for recursive matching:
- ❌ `node_modules/**` - Only excludes root-level node_modules
- ✅ `**/node_modules/**` - Excludes node_modules at any depth
- ❌ `build/` - Won't work (needs file pattern)
- ✅ `build/**` - Excludes root-level build directory
- ✅ `**/build/**` - Excludes build directory at any depth

### Global Settings

Access via: File → Preferences → Settings → Remote Sync

**Sync Interval** (`remoteSync.syncInterval`)
- How often to check for changes (in seconds)
- Default: 60
- Minimum: 10
- Recommended: 30-120 for active development, 300+ for stable projects

**Backup Count** (`remoteSync.backupCount`)
- Number of local backups to keep per file
- Default: 3
- Range: 1-10
- Older backups are automatically deleted

**Global Exclude Patterns** (`remoteSync.excludePatterns`)
- Default patterns applied to all sync targets
- Can be overridden per-target during configuration

## Configuration File

Sync configuration is stored in `.vscode/sync-config.json`:

```json
{
  "projectId": "127.0.0.1_home_user_project",
  "remotePath": "/home/user/project",
  "localPath": "D:\\backup\\project",
  "syncInterval": 60,
  "backupCount": 3,
  "excludePatterns": ["node_modules/**", ".git/**"],
  "enabled": true,
  "host": "127.0.0.1",
  "port": 22,
  "username": "user",
  "identityFile": "C:\\Users\\user\\.ssh\\id_rsa",
  "syncTargets": [
    {
      "projectId": "127.0.0.1_home_user_project",
      "remotePath": "/home/user/project",
      "localPath": "D:\\backup\\project",
      "enabled": true,
      "excludePatterns": ["node_modules/**"]
    }
  ]
}
```

## Advanced Configuration

### Multiple Sync Targets

Configure multiple directories from the same remote server:

1. Configure first directory via right-click
2. Configure additional directories the same way
3. Each appears in sidebar with independent controls

All targets share the same SSH connection but have:
- Independent sync schedules
- Separate exclude patterns
- Individual start/stop controls

### SSH Config Integration

Create `~/.ssh/config` for easier connection:

```
Host my-server
    HostName 192.168.1.100
    Port 22
    User myuser
    IdentityFile ~/.ssh/id_rsa
```

Then use `my-server` as the host when configuring.

### Password Management

Passwords are stored in **Windows Credential Manager**:
- View: Control Panel → Credential Manager → Windows Credentials
- Look for: `remoteSync.password.host:username`
- Delete to force re-prompt

### Auto-Start Behavior

Sync automatically starts when:
- VSCode opens with saved configuration
- Password is available in Credential Manager
- Remote server is reachable

To disable auto-start:
- Stop sync manually
- Or remove target from sidebar

## Presets for Common Projects

### Node.js / JavaScript
```
node_modules/**,dist/**,build/**,.next/**,.nuxt/**,*.log
```

### Python
```
__pycache__/**,*.pyc,.venv/**,venv/**,.pytest_cache/**,*.egg-info/**
```

### Java / Maven
```
target/**,build/**,.gradle/**,*.class,*.jar
```

### Rust
```
target/**,Cargo.lock
```

### Go
```
vendor/**,bin/**,*.exe
```

## Troubleshooting

### Configuration Not Saved

**Symptom**: Settings lost after restart

**Solution**:
- Ensure `.vscode` directory is writable
- Check workspace folder is properly opened
- Verify not running in restricted mode

### Password Prompt Every Time

**Symptom**: Password not remembered

**Solution**:
- Check Windows Credential Manager is accessible
- Run VSCode with normal user permissions (not restricted)
- Manually add credential in Credential Manager

### Exclude Patterns Not Working

**Symptom**: Unwanted files still syncing

**Solution**:
- Check pattern syntax (use `/` not `\`)
- Use `**` for recursive matching
- Test pattern with online glob tester
- Check per-target patterns override global patterns

### Sync Not Starting Automatically

**Symptom**: Must manually start after VSCode opens

**Solution**:
- Verify configuration file exists in `.vscode/sync-config.json`
- Check password is stored in Credential Manager
- Look for errors in Output panel (View → Output → Remote Code Sync)
- Ensure remote server is reachable

## Best Practices

1. **Exclude Build Artifacts**: Always exclude generated files to save bandwidth
2. **Reasonable Intervals**: Use 60-120s for active work, longer for stable projects
3. **Backup Count**: Keep 3-5 backups for important projects
4. **Test First**: Configure with small directory first to verify setup
5. **Monitor Logs**: Check Output panel if sync seems slow or stuck
6. **Secure Passwords**: Use private keys when possible instead of passwords
