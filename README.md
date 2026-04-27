# Remote Backup Sync

Continuously backup remote Linux code to local Windows via SSH. Protect your work from remote server failures.

## ⚠️ Important Disclaimers

**USE AT YOUR OWN RISK.** This extension is provided "AS IS" without warranty of any kind.

**Before using this extension, please understand:**

1. **Data Loss Risk**: While this extension is designed to backup files, bugs or misconfigurations could result in data loss on your local machine. Always maintain separate backups of important data.

2. **No Warranty**: This software comes with NO WARRANTY of any kind. The author is not responsible for any data loss, corruption, or other damages.

3. **Test First**: Always test with non-critical data first. Verify the sync behavior matches your expectations before using with important projects.

4. **Local Overwrites**: This extension will overwrite local files when remote files change. While it attempts to backup locally modified files first, this protection is not foolproof.

5. **Configuration Errors**: Incorrect configuration (especially local path) could cause files to be written to unintended locations.

6. **Beta Software**: This is version 0.1.0 - early stage software. Expect bugs and limitations.

7. **Partial Sync Failures**: Individual file sync failures are possible due to network issues, permissions, or file locks. The extension will report these failures, but some files may not be backed up. Always check sync logs after each sync.

8. **Local Modification Detection Limitations**: The extension uses file modification time (mtime) to detect local changes. This method has known limitations:
   - Clock changes or time zone adjustments can cause false positives/negatives
   - Some tools preserve timestamps when copying files, bypassing detection
   - Windows time precision issues may cause missed detections
   - **Risk**: Local modifications may be overwritten without backup in edge cases
   - **Mitigation**: Use Git or other version control as your primary backup strategy

**Recommended Precautions:**
- Start with a test directory containing non-critical files
- Verify backup behavior before using with production code
- Keep independent backups of important work
- Review sync logs regularly after each sync
- **Use version control (Git) as your primary backup strategy - this extension is a secondary safety net only**
- Monitor the sync status and check for warnings about failed files

## Features

- **Automatic Sync**: Continuously sync remote directories to local Windows
- **Multi-Directory Support**: Sync multiple remote directories simultaneously
- **Smart Backup**: Automatically backup locally modified files before overwriting
- **Keep-Only Strategy**: Remote deletions don't delete local files (防止误删传播)
- **Password Security**: Passwords stored in system keychain (Windows Credential Manager)
- **Custom Exclude Rules**: Configure different exclude patterns for each directory
- **Visual Management**: Sidebar view to manage all sync targets
- **Auto-Start**: Automatically resume sync when VSCode starts

## Installation

1. Download the `.vsix` file
2. Open VSCode
3. Go to Extensions (Ctrl+Shift+X)
4. Click `...` → Install from VSIX
5. Select the downloaded file

## Usage

### Configure Sync Target

1. Connect to remote server via Remote-SSH
2. Right-click on a folder in Explorer
3. Select "Configure Code Sync to Local"
4. Enter:
   - SSH host (auto-detected if available)
   - Username
   - Password (stored securely)
   - Local backup path (e.g., `D:\backup\myproject`)
   - Exclude patterns (comma-separated, glob format)
     - Use `**` for recursive: `**/node_modules/**` excludes at any depth
     - Single `*` for one level: `*.log` excludes log files in root only

### Manage Sync Targets

Open the "Remote Sync" sidebar (Activity Bar icon):

- **Start**: Click ▶ to start syncing a specific directory
- **Stop**: Click ⏹ to stop syncing
- **Remove**: Click 🗑 to remove from sync list

### Auto-Start

Configured sync targets automatically start when VSCode opens.

## Configuration

Settings (File → Preferences → Settings → Remote Sync):

- `remoteSync.syncInterval`: Sync interval in seconds (default: 60, min: 10)
- `remoteSync.backupCount`: Number of backups to keep (default: 3, range: 1-10)
- `remoteSync.excludePatterns`: Global exclude patterns

## How It Works

1. **Snapshot-Based Detection**: Compares file metadata (mtime, size) to detect changes
2. **One-Way Sync**: Remote → Local only
3. **Local Modification Protection**: Creates timestamped backups before overwriting
4. **Keep-Only Strategy**: Remote deletions are recorded but local files are preserved
5. **Secure Storage**: Passwords stored in Windows Credential Manager

## Known Limitations

### Critical Limitations

1. **Local Modification Detection is Not Foolproof**
   - Uses file modification time (mtime) only, not content hashing
   - **Can fail when:**
     - System clock changes (time zone, manual adjustment, NTP sync)
     - Tools preserve timestamps when copying/moving files
     - File is modified within the same second (time precision limits)
     - Windows filesystem time precision issues
   - **Risk**: Local changes may be overwritten without backup
   - **Mitigation**: Always use Git or other version control as primary backup

2. **Partial Sync Failures May Occur**
   - Individual files can fail to sync due to:
     - Network interruptions
     - File permission issues
     - File locks (file in use)
     - Disk space issues
   - **The extension will warn you**, but some files may not be backed up
   - **Always check sync logs** after each sync to verify all files succeeded

3. **One-Way Sync Only**
   - Remote → Local only
   - Local changes are NOT synced back to remote
   - This is by design to prevent accidental remote modifications

### Other Limitations

4. **Windows Local Path Required**: Local backup must be on Windows filesystem
5. **No Conflict Resolution**: If both local and remote change, remote wins (with backup)
6. **No Symbolic Link Support**: Symbolic links are not followed or synced
7. **Database is JSON-based**: Not optimized for very large projects (10,000+ files)
8. **Sequential File Transfer**: Files are synced one at a time (no concurrent downloads)
   - This may be slow for projects with many small files
   - Large files can block other files from syncing
9. **Shared SSH Connection**: All sync targets share a single SSH connection
   - If the connection fails, all targets are affected
   - Connection timeout affects all targets simultaneously
10. **No SFTP Operation Timeout**: Individual file operations can hang indefinitely
    - Workaround: Restart VSCode if sync appears stuck

### Best Practices to Mitigate Risks

- ✅ **Use Git as primary backup** - This extension is a secondary safety net
- ✅ **Check sync logs regularly** - Look for warnings about failed files
- ✅ **Test with non-critical data first**
- ✅ **Keep backup count at 3-5** for important projects
- ✅ **Use appropriate exclude patterns** to avoid syncing unnecessary files
- ✅ **Monitor disk space** on local machine
- ✅ **Use on trusted networks** - No explicit SSH host key verification
- ✅ **Restart VSCode if sync hangs** - No automatic timeout recovery

## Architecture

```
┌─────────────────────────────────────────────────┐
│              VSCode Extension (Local)            │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │ TreeView UI  │      │ Status Bar   │        │
│  └──────────────┘      └──────────────┘        │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │         SyncScheduler (per target)        │  │
│  │  ┌────────────┐  ┌──────────────────┐   │  │
│  │  │ FileSyncEng│  │ LocalBackupMgr   │   │  │
│  │  └────────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │      SSHConnectionManager (shared)        │  │
│  └──────────────────────────────────────────┘  │
│                    │                             │
└────────────────────┼─────────────────────────────┘
                     │ SSH/SFTP
                     ▼
         ┌───────────────────────┐
         │   Remote Linux Server  │
         └───────────────────────┘
```

## Troubleshooting

### Connection Issues

- Verify SSH credentials
- Check network connectivity
- Ensure SSH server is running on remote

### Files Not Syncing

- Check exclude patterns
- Verify remote path exists
- Check Output panel (View → Output → Remote Code Sync)

### Password Not Saved

- Windows Credential Manager must be available
- Run VSCode with sufficient permissions

## Requirements

- VSCode 1.80.0 or higher
- Remote-SSH extension (for remote development)
- SSH access to remote server
- Windows OS (for local backup)

## License

MIT License - See [LICENSE](LICENSE) file for full text.

**Key Points:**
- This software is provided "AS IS" without warranty
- The author is not liable for any damages or data loss
- Use at your own risk
- You are responsible for testing and verifying the software meets your needs

## Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, INCIDENTAL, INDIRECT, OR CONSEQUENTIAL DAMAGES WHATSOEVER (INCLUDING, WITHOUT LIMITATION, DAMAGES FOR LOSS OF BUSINESS PROFITS, BUSINESS INTERRUPTION, LOSS OF BUSINESS INFORMATION, OR ANY OTHER PECUNIARY LOSS) ARISING OUT OF THE USE OF OR INABILITY TO USE THIS SOFTWARE, EVEN IF THE AUTHOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

## Support

Report issues at: https://github.com/zyuchen2006/remote-backup-sync/issues
