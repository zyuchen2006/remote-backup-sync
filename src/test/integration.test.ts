import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { SSHFileAccessor } from '../core/SSHFileAccessor';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { DatabaseManager } from '../core/DatabaseManager';
import { TEST_CONFIG } from './setup';

describe('Integration Tests', () => {
  let sshManager: SSHConnectionManager;
  let dbManager: DatabaseManager;
  let syncEngine: FileSyncEngine;
  const testDbPath = path.join(TEST_CONFIG.local.basePath, 'integration-test-db.json');
  const remoteTestDir = `${TEST_CONFIG.remote.testDir}/integration`;
  const localTestDir = path.join(TEST_CONFIG.local.testDir, 'integration');

  before(async function() {
    this.timeout(15000);

    // Setup local directory
    if (!fs.existsSync(localTestDir)) {
      fs.mkdirSync(localTestDir, { recursive: true });
    }

    // Setup SSH connection
    sshManager = new SSHConnectionManager({
      host: TEST_CONFIG.ssh.host,
      port: TEST_CONFIG.ssh.port,
      username: TEST_CONFIG.ssh.username,
      password: TEST_CONFIG.ssh.password
    });
    await sshManager.connect();

    // Create remote test directory
    const sftp = sshManager.getSFTP();
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(remoteTestDir, { mode: 0o755 }, (err) => {
        if (err && err.message !== 'Failure') reject(err);
        else resolve();
      });
    });

    // Setup database and sync engine
    dbManager = new DatabaseManager(testDbPath);
    const accessor = new SSHFileAccessor(remoteTestDir, [], sshManager);
    syncEngine = new FileSyncEngine(
      'integration-test',
      remoteTestDir,
      localTestDir,
      accessor,
      dbManager
    );
  });

  after(async function() {
    this.timeout(10000);

    // Cleanup remote directory
    if (sshManager) {
      const sftp = sshManager.getSFTP();
      await new Promise<void>((resolve) => {
        sftp.rmdir(remoteTestDir, () => resolve());
      });
      sshManager.disconnect();
    }

    // Cleanup local
    if (fs.existsSync(localTestDir)) {
      fs.rmSync(localTestDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('SSH Connection', () => {
    it('should connect successfully', () => {
      assert.strictEqual(sshManager.isConnected(), true);
    });

    it('should get SFTP session', () => {
      const sftp = sshManager.getSFTP();
      assert.ok(sftp);
    });
  });

  describe('File Transfer', () => {
    it('should upload and download file', async function() {
      this.timeout(10000);

      const testContent = 'Integration test content\n'.repeat(100);
      const remoteFile = `${remoteTestDir}/test-file.txt`;
      const localFile = path.join(localTestDir, 'test-file.txt');

      // Upload via SFTP
      const sftp = sshManager.getSFTP();
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(remoteFile, testContent, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Download via sync engine
      await syncEngine.downloadFile('test-file.txt');

      // Verify
      assert.strictEqual(fs.existsSync(localFile), true);
      const downloadedContent = fs.readFileSync(localFile, 'utf-8');
      assert.strictEqual(downloadedContent, testContent);
    });

    it('should handle large files', async function() {
      this.timeout(30000);

      const largeContent = 'X'.repeat(1024 * 1024); // 1MB
      const remoteFile = `${remoteTestDir}/large-file.bin`;
      const localFile = path.join(localTestDir, 'large-file.bin');

      const sftp = sshManager.getSFTP();
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(remoteFile, largeContent, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await syncEngine.downloadFile('large-file.bin');

      assert.strictEqual(fs.existsSync(localFile), true);
      const stats = fs.statSync(localFile);
      assert.strictEqual(stats.size, largeContent.length);
    });
  });

  describe('Remote Directory Scanning', () => {
    it('should scan remote directory', async function() {
      this.timeout(10000);

      // Create test files on remote
      const sftp = sshManager.getSFTP();
      const testFiles = ['scan1.txt', 'scan2.txt', 'scan3.txt'];

      for (const file of testFiles) {
        await new Promise<void>((resolve, reject) => {
          sftp.writeFile(`${remoteTestDir}/${file}`, 'content', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      const remoteFiles = await syncEngine.scanRemoteDirectory();
      assert.ok(remoteFiles.size >= testFiles.length);

      for (const file of testFiles) {
        assert.ok(remoteFiles.has(file));
      }
    });
  });

  describe('Database Operations', () => {
    it('should store and retrieve snapshots', () => {
      const snapshot = {
        projectId: 'integration-test',
        filePath: 'db-test.txt',
        remoteMtime: Date.now(),
        localMtime: Date.now(),
        fileSize: 1024,
        lastSyncTime: Date.now()
      };

      dbManager.upsertSnapshot(snapshot);
      const retrieved = dbManager.getSnapshot('integration-test', 'db-test.txt');

      assert.ok(retrieved);
      assert.strictEqual(retrieved.filePath, snapshot.filePath);
      assert.strictEqual(retrieved.fileSize, snapshot.fileSize);
    });

    it('should get all snapshots for project', () => {
      const snapshots = dbManager.getAllSnapshots('integration-test');
      assert.ok(Array.isArray(snapshots));
      assert.ok(snapshots.length > 0);
    });
  });
});
