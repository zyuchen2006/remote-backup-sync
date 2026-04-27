export const TEST_CONFIG = {
  ssh: {
    host: '127.0.0.1',
    port: 22,
    username: 'zyc',
    password: ''
  },
  remote: {
    basePath: '/home/zyc/test',
    testDir: '/home/zyc/test/sync-test'
  },
  local: {
    basePath: 'D:\\temp\\remote_bak_test\\ut',
    testDir: 'D:\\temp\\remote_bak_test\\ut\\sync-test'
  },
  performance: {
    fileCount: 10000,
    maxFileSizeKB: 100
  }
};

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
