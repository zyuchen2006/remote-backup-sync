# Usage Examples

## Example 1: Basic Setup for Node.js Project

### Scenario
You're developing a Node.js application on a remote Linux server and want to continuously backup the code to your local Windows machine.

### Steps

1. **Connect to Remote Server**
   - Open VSCode
   - Use Remote-SSH extension to connect to your server
   - Open your project folder (e.g., `/home/user/myapp`)

2. **Configure Sync**
   - Right-click on the project folder in Explorer
   - Select "Configure Code Sync to Local"
   - Enter details:
     - SSH host: `myserver.com` (auto-detected)
     - Username: `user` (auto-detected)
     - Password: `********` (stored securely)
     - Local path: `D:\backup\myapp`
     - Exclude patterns: `node_modules/**,.git/**,*.log`

3. **Start Syncing**
   - Click "Start Sync" in the dialog
   - Or use Command Palette: "Remote Sync: Start"
   - Status bar shows sync progress

4. **Verify Backup**
   - Check `D:\backup\myapp` on your Windows machine
   - Files are continuously synced every 60 seconds
   - Modified files are backed up before overwriting

### Result
Your remote code is now continuously backed up to Windows. If the remote server fails, you have a complete local copy.

---

## Example 2: Multiple Project Sync

### Scenario
You work on multiple projects on the same remote server and want to backup all of them.

### Steps

1. **Configure First Project**
   - Connect to remote server via Remote-SSH
   - Navigate to `/home/user/project1`
   - Right-click → "Configure Code Sync to Local"
   - Local path: `D:\backup\project1`

2. **Configure Second Project**
   - Navigate to `/home/user/project2`
   - Right-click → "Configure Code Sync to Local"
   - Local path: `D:\backup\project2`

3. **Manage Targets**
   - Open "Remote Sync" sidebar (Activity Bar icon)
   - See both projects listed
   - Each has independent start/stop controls
   - All share the same SSH connection

### Result
Both projects sync independently to different local directories. You can start/stop each individually.

---

## Example 3: Custom Exclude Patterns

### Scenario
You have a Python project with large datasets and virtual environments that you don't want to backup.

### Configuration

```
Exclude patterns:
venv/**,
__pycache__/**,
*.pyc,
.pytest_cache/**,
data/raw/**,
data/processed/**,
*.db,
*.sqlite
```

### Explanation
- `venv/**` - Excludes virtual environment (can be recreated)
- `__pycache__/**` - Excludes Python cache
- `*.pyc` - Excludes compiled Python files
- `data/raw/**` - Excludes large raw datasets
- `*.db`, `*.sqlite` - Excludes database files

### Result
Only source code and configuration files are backed up, saving disk space and sync time.

---

## Example 4: Handling Local Modifications

### Scenario
You accidentally modified a file locally and want to restore it from the remote version.

### What Happens

1. **Local Modification Detected**
   - You edit `D:\backup\myapp\config.js` locally
   - Next sync detects the modification (via mtime)
   - Extension creates backup: `D:\backup\myapp\.sync-backups\config.js.20260425_143022`
   - Remote version overwrites local file

2. **Restore Your Changes**
   - Navigate to `.sync-backups` folder
   - Find `config.js.20260425_143022`
   - Copy your changes if needed
   - Or restore the entire file

### Best Practice
**Use Git as your primary backup strategy.** This extension is a secondary safety net for server failures, not a replacement for version control.

---

## Example 5: Monitoring Sync Status

### Status Bar Indicators

- **$(sync) Idle** - Waiting for next sync
- **$(sync~spin) Syncing (3/10)** - Actively syncing files
- **$(check) Complete** - Sync finished successfully
- **$(error) Error** - Sync failed (click for details)

### Sidebar View

Open "Remote Sync" in Activity Bar to see:
- All configured sync targets
- Current status of each target
- Start/stop/remove controls

### Output Logs

View detailed logs:
1. Open Output panel (View → Output)
2. Select "Remote Code Sync" from dropdown
3. See detailed sync activity:
   ```
   [2026-04-25 14:30:22] Connecting to myserver.com:22...
   [2026-04-25 14:30:23] Connected successfully
   [2026-04-25 14:30:24] Scanning remote files...
   [2026-04-25 14:30:25] Found 3 changes: +2 ~1 -0
   [2026-04-25 14:30:26] Downloading src/app.js...
   [2026-04-25 14:30:27] Sync complete: +2 ~1 -0 (1.2 MB)
   ```

---

## Example 6: Disaster Recovery

### Scenario
Your remote server crashes and is unrecoverable. You need to restore your work.

### Recovery Steps

1. **Access Local Backup**
   - Navigate to `D:\backup\myapp`
   - All files are there, up to the last sync (max 60 seconds old)

2. **Set Up New Server**
   - Provision new remote server
   - Install dependencies

3. **Upload Code**
   - Use SFTP, rsync, or Git to upload from `D:\backup\myapp`
   - Or work locally and push to Git

4. **Resume Development**
   - Reconfigure sync to new server
   - Continue working

### What You Saved
- All code up to last sync (typically < 1 minute old)
- All local modifications (backed up in `.sync-backups`)
- No data loss from server failure

---

## Example 7: Performance Optimization

### For Large Projects (1000+ files)

**Recommended Settings:**

```json
{
  "remoteSync.syncInterval": 120,  // Sync every 2 minutes instead of 1
  "remoteSync.excludePatterns": [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "*.log",
    "*.tmp"
  ]
}
```

**Why:**
- Longer interval reduces server load
- Excluding build artifacts saves time and space
- Focus on source files only

### For Slow Networks

- Increase sync interval to 180-300 seconds
- Exclude large binary files
- Use more aggressive exclude patterns

---

## Troubleshooting Examples

### Problem: Files Not Syncing

**Check:**
1. Exclude patterns - file might be excluded
2. Remote path exists and is accessible
3. Output logs for errors
4. SSH connection is active

**Solution:**
```
1. Open Output panel → "Remote Code Sync"
2. Look for error messages
3. Verify exclude patterns don't match your files
4. Test SSH connection manually
```

### Problem: Password Not Saved

**Check:**
1. Windows Credential Manager is accessible
2. VSCode has sufficient permissions

**Solution:**
```
1. Run VSCode as administrator (if needed)
2. Re-enter password when prompted
3. Check Windows Credential Manager for stored credentials
```

### Problem: Sync Too Slow

**Check:**
1. Number of files being synced
2. Network speed
3. Exclude patterns

**Solution:**
```
1. Add more exclude patterns (node_modules, build artifacts)
2. Increase sync interval
3. Check network connectivity
```

---

## Best Practices

1. **Use Git as Primary Backup**
   - This extension is a secondary safety net
   - Commit and push regularly to Git

2. **Configure Appropriate Excludes**
   - Exclude dependencies (node_modules, venv)
   - Exclude build artifacts (dist, build)
   - Exclude large datasets

3. **Monitor Sync Logs**
   - Check for failed files
   - Verify sync completes successfully
   - Watch for warnings

4. **Test Your Backup**
   - Periodically verify local files are up-to-date
   - Test restore process
   - Ensure critical files are included

5. **Secure Your Credentials**
   - Use SSH keys when possible
   - Keep passwords secure
   - Use trusted networks only

6. **Plan for Disk Space**
   - Monitor local disk usage
   - Adjust backup count as needed
   - Clean old backups periodically
