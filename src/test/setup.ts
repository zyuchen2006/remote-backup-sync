export const TEST_CONFIG = {
  ssh: {
    host: process.env.TEST_SSH_HOST || '127.0.0.1',
    port: parseInt(process.env.TEST_SSH_PORT || '22'),
    username: process.env.TEST_SSH_USERNAME || 'zyc',
    password: process.env.TEST_SSH_PASSWORD || ''
  },
  remote: {
    basePath: process.env.TEST_REMOTE_BASE || '/home/zyc/test',
    testDir: process.env.TEST_REMOTE_DIR || '/home/zyc/test/sync-test'
  },
  local: {
    basePath: process.env.TEST_LOCAL_BASE || 'D:\\temp\\remote_bak_test\\ut',
    testDir: process.env.TEST_LOCAL_DIR || 'D:\\temp\\remote_bak_test\\ut\\sync-test'
  },
  performance: {
    fileCount: parseInt(process.env.TEST_FILE_COUNT || '10000'),
    maxFileSizeKB: parseInt(process.env.TEST_MAX_FILE_SIZE_KB || '100')
  }
};

// Validate SSH password is provided for tests that need it
export function validateSSHConfig(): void {
  if (!TEST_CONFIG.ssh.password) {
    console.warn('\n⚠️  Warning: SSH password not provided.');
    console.warn('Set TEST_SSH_PASSWORD environment variable to run SSH tests.');
    console.warn('Example: TEST_SSH_PASSWORD=yourpassword npm test\n');
  }
}

export function generateTestFiles(count: number): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (let i = 0; i < count; i++) {
    const dir = `dir${Math.floor(i / 100)}`;
    const filename = `file${i}.txt`;
    files.push({
      path: `${dir}/${filename}`,
      content: `Test content ${i}\n`.repeat(10)
    });
  }
  return files;
}
