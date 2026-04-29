import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { SSHFileAccessor } from '../core/SSHFileAccessor';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { DatabaseManager } from '../core/DatabaseManager';
import { TEST_CONFIG, generateTestFiles } from './setup';

describe('Performance Tests', () => {
  let sshManager: SSHConnectionManager;
  let dbManager: DatabaseManager;
  let syncEngine: FileSyncEngine;
  const testDbPath = path.join(TEST_CONFIG.local.basePath, 'perf-test-db.json');
  const remoteTestDir = `${TEST_CONFIG.remote.testDir}/performance`;
  const localTestDir = path.join(TEST_CONFIG.local.testDir, 'performance');

  before(async function() {
    this.timeout(60000);

    if (!fs.existsSync(localTestDir)) {
      fs.mkdirSync(localTestDir, { recursive: true });
    }

    sshManager = new SSHConnectionManager({
      host: TEST_CONFIG.ssh.host,
      port: TEST_CONFIG.ssh.port,
      username: TEST_CONFIG.ssh.username,
      password: TEST_CONFIG.ssh.password
    });
    await sshManager.connect();

    const sftp = sshManager.getSFTP();
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(remoteTestDir, { mode: 0o755 }, (err) => {
        if (err && err.message !== 'Failure') reject(err);
        else resolve();
      });
    });

    dbManager = new DatabaseManager(testDbPath);
    const accessor = new SSHFileAccessor(remoteTestDir, [], sshManager);
    syncEngine = new FileSyncEngine('perf-test', remoteTestDir, localTestDir, accessor, dbManager);

    console.log(`\n[Performance Test] Creating ${TEST_CONFIG.performance.fileCount} test files on remote...`);
    await createRemoteTestFiles(sftp, remoteTestDir, TEST_CONFIG.performance.fileCount);
    console.log('[Performance Test] Test files created');
  });

  after(async function() {
    this.timeout(300000);
    if (sshManager) {
      console.log('[Performance Test] Cleaning up remote test files...');
      await cleanupRemoteDir(sshManager, remoteTestDir);
      sshManager.disconnect();
    }
    if (fs.existsSync(localTestDir)) {
      fs.rmSync(localTestDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Large Project Sync', () => {
    it(`should scan ${TEST_CONFIG.performance.fileCount} files efficiently`, async function() {
      this.timeout(120000);

      const startTime = Date.now();
      const remoteFiles = await syncEngine.scanRemoteDirectory();
      const scanDuration = Date.now() - startTime;

      console.log(`\n[Performance] Scanned ${remoteFiles.size} files in ${scanDuration}ms`);
      console.log(`[Performance] Average: ${(scanDuration / remoteFiles.size).toFixed(2)}ms per file`);

      assert.ok(remoteFiles.size >= TEST_CONFIG.performance.fileCount * 0.9); // Allow 10% margin
      assert.ok(scanDuration < 60000, 'Scan should complete within 60 seconds');
    });

    it('should detect changes efficiently', async function() {
      this.timeout(30000);

      const remoteFiles = await syncEngine.scanRemoteDirectory();

      const startTime = Date.now();
      const changes = syncEngine.detectChanges(remoteFiles);
      const detectDuration = Date.now() - startTime;

      console.log(`\n[Performance] Detected ${changes.length} changes in ${detectDuration}ms`);
      console.log(`[Performance] Average: ${(detectDuration / changes.length).toFixed(2)}ms per file`);

      assert.ok(detectDuration < 10000, 'Change detection should complete within 10 seconds');
    });

    it('should sync files with reasonable throughput', async function() {
      this.timeout(300000); // 5 minutes

      const remoteFiles = await syncEngine.scanRemoteDirectory();
      const changes = syncEngine.detectChanges(remoteFiles);

      // Sync first 100 files to measure throughput
      const sampleSize = Math.min(100, changes.length);
      const sampleChanges = changes.slice(0, sampleSize);

      const startTime = Date.now();
      let totalBytes = 0;

      for (const change of sampleChanges) {
        await syncEngine.downloadFile(change.path);
        syncEngine.updateSnapshot(change.path, change.remoteMtime!, change.size!);
        totalBytes += change.size || 0;
      }

      const duration = Date.now() - startTime;
      const throughputMBps = (totalBytes / 1024 / 1024) / (duration / 1000);

      console.log(`\n[Performance] Synced ${sampleSize} files (${(totalBytes / 1024 / 1024).toFixed(2)}MB) in ${duration}ms`);
      console.log(`[Performance] Throughput: ${throughputMBps.toFixed(2)} MB/s`);
      console.log(`[Performance] Average: ${(duration / sampleSize).toFixed(2)}ms per file`);

      assert.ok(duration / sampleSize < 1000, 'Average sync time should be under 1 second per file');
    });
  });

  describe('Database Performance', () => {
    it('should handle large number of snapshots', function() {
      this.timeout(120000);

      const startTime = Date.now();

      // Insert 10000 snapshots
      for (let i = 0; i < 10000; i++) {
        dbManager.upsertSnapshot({
          projectId: 'perf-test',
          filePath: `file${i}.txt`,
          remoteMtime: Date.now(),
          localMtime: Date.now(),
          fileSize: 1024,
          lastSyncTime: Date.now()
        });
      }

      const insertDuration = Date.now() - startTime;
      console.log(`\n[Performance] Inserted 10000 snapshots in ${insertDuration}ms`);

      // Query all snapshots
      const queryStart = Date.now();
      const snapshots = dbManager.getAllSnapshots('perf-test');
      const queryDuration = Date.now() - queryStart;

      console.log(`[Performance] Queried ${snapshots.length} snapshots in ${queryDuration}ms`);

      assert.ok(queryDuration < 5000, 'Query should complete within 5 seconds');
    });
  });

  describe('Memory Usage', () => {
    it('should not exceed memory limits during large sync', async function() {
      this.timeout(180000);

      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      console.log(`\n[Performance] Initial memory: ${initialMemory.toFixed(2)}MB`);

      const remoteFiles = await syncEngine.scanRemoteDirectory();
      const changes = syncEngine.detectChanges(remoteFiles);

      // Sync 500 files
      const sampleSize = Math.min(500, changes.length);
      for (let i = 0; i < sampleSize; i++) {
        await syncEngine.downloadFile(changes[i].path);
        syncEngine.updateSnapshot(changes[i].path, changes[i].remoteMtime!, changes[i].size!);

        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
          console.log(`[Performance] Memory after ${i} files: ${currentMemory.toFixed(2)}MB`);
        }
      }

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`[Performance] Final memory: ${finalMemory.toFixed(2)}MB`);
      console.log(`[Performance] Memory increase: ${memoryIncrease.toFixed(2)}MB`);

      assert.ok(memoryIncrease < 500, 'Memory increase should be under 500MB');
    });
  });
});

async function createRemoteTestFiles(sftp: any, baseDir: string, count: number): Promise<void> {
  const files = generateTestFiles(count);

  // Create directories first
  const dirs = new Set(files.map(f => path.dirname(f.path)));
  for (const dir of dirs) {
    await new Promise<void>((resolve) => {
      sftp.mkdir(`${baseDir}/${dir}`, { mode: 0o755 }, () => resolve());
    });
  }

  // Create files in batches
  const batchSize = 100;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(batch.map(file =>
      new Promise<void>((resolve) => {
        sftp.writeFile(`${baseDir}/${file.path}`, file.content, () => resolve());
      })
    ));
    if ((i + batchSize) % 1000 === 0) {
      console.log(`[Performance Test] Created ${i + batchSize}/${count} files`);
    }
  }
}

async function cleanupRemoteDir(sshManager: SSHConnectionManager, dir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Use SSH exec instead of SFTP for much faster deletion
    sshManager.getClient().exec(`rm -rf "${dir}"`, (err: any, stream: any) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Cleanup failed with code ${code}. stderr: ${stderr}`));
        }
      });

      stream.on('data', (data: any) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
    });
  });
}
