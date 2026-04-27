# Security Policy

## Security Considerations

This extension handles sensitive operations including:
- SSH credentials (passwords stored in Windows Credential Manager)
- File system access (reading remote files, writing local files)
- Network connections to remote servers

## Known Security Limitations

1. **Password Storage**: Passwords are stored in Windows Credential Manager. While this is more secure than plain text, it's not encryption at rest. Consider using SSH keys instead.

2. **No SSH Host Key Verification**: The extension does not explicitly verify SSH host keys or certificates. It relies on the ssh2 library's default behavior and ~/.ssh/known_hosts file. Man-in-the-middle attacks are theoretically possible if:
   - You connect to a server for the first time without verifying the host key
   - An attacker intercepts the connection before the host key is saved
   - **Mitigation**: Always verify SSH host keys manually on first connection, especially over untrusted networks

3. **Local File Overwrites**: The extension will overwrite local files. Ensure your local backup path is correct and isolated.

4. **No Sandboxing**: The extension runs with full VSCode permissions and can access any files the user can access.

5. **Concurrent Operations**: The extension uses a single SSH connection shared across multiple sync targets. While this is efficient, a connection failure affects all targets simultaneously.

## Best Practices

1. **Use SSH Keys**: Prefer SSH key authentication over passwords when possible
2. **Verify Host Keys**: Manually verify SSH host keys on first connection
3. **Dedicated Backup Directory**: Use a dedicated directory for backups, not mixed with other important files
4. **Regular Audits**: Review sync logs and backup directories regularly
5. **Trusted Networks Only**: Only use on trusted networks, especially when using password authentication
6. **Principle of Least Privilege**: Use SSH accounts with minimal necessary permissions

## Reporting Security Issues

If you discover a security vulnerability, please report it to:
- Create a private security advisory on GitHub: https://github.com/zyuchen2006/remote-backup-sync/security/advisories
- Or create an issue at: https://github.com/zyuchen2006/remote-backup-sync/issues

**Do not** publicly disclose security vulnerabilities until they have been addressed.

## Disclaimer

This extension is provided "AS IS" without warranty. The author is not responsible for any security breaches, data loss, or other damages resulting from the use of this software.

Users are responsible for:
- Securing their own credentials
- Configuring the extension correctly
- Understanding the security implications of syncing files
- Maintaining independent backups
- Verifying SSH host keys on first connection

