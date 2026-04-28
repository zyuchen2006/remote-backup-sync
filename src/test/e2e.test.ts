import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { SSHFileAccessor } from '../core/SSHFileAccessor';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { LocalBackupManager } from '../core/LocalBackupManager';
import { DatabaseManager } from '../core/DatabaseManager';
import { SyncScheduler } from '../core/SyncScheduler';
import { TEST_CONFIG } from './setup';

describe('End-to-End Tests', () => {
  let sshManager: SSHConnectionManager;
  let dbManager: DatabaseManager;
  let syncEngine: FileSyncEngine;
  let backupManager: LocalBackupManager;
  let scheduler: SyncScheduler;
  const testDbPath = path.join(TEST_CONFIG.local.basePath, 'e2e-test-db.json');
  const remoteTestDir = `${TEST_CONFIG.remote.testDir}/e2e`;
  const localTestDir = path.join(TEST_CONFIG.local.testDir, 'e2e');

  before(async function() {
    this.timeout(20000);

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
    syncEngine = new FileSyncEngine('e2e-test', remoteTestDir, localTestDir, accessor, dbManager);
    backupManager = new LocalBackupManager('e2e-test', localTestDir, { maxBackups: 3 }, dbManager);
  });

  after(async function() {
    this.timeout(10000);
    scheduler?.stop();
    if (sshManager) {
      const sftp = sshManager.getSFTP();
      await new Promise<void>((resolve) => {
        sftp.rmdir(remoteTestDir, () => resolve());
      });
      sshManager.disconnect();
    }
    if (fs.existsSync(localTestDir)) {
      fs.rmSync(localTestDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Complete Sync Flow', () => {
    it('should sync new files from remote to local', async function() {
      this.timeout(15000);

      // Create files on remote
      const sftp = sshManager.getSFTP();
      const testFiles = ['file1.txt', 'file2.txt', 'file3.txt'];

      for (const file of testFiles) {
        await new Promise<void>((resolve, reject) => {
          sftp.writeFile(`${remoteTestDir}/${file}`, `Content of ${file}`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Scan and detect changes
      let remoteFiles = await syncEngine.scanRemoteDirectory();
      let changes = syncEngine.detectChanges(remoteFiles);

      assert.strictEqual(changes.length, testFiles.length);
      assert.ok(changes.every(c => c.type === 'added'));

      // Download files
      for (const change of changes) {
        await syncEngine.downloadFile(change.path);
        syncEngine.updateSnapshot(change.path, change.remoteMtime!, change.size!);
      }

      // Verify local files
      for (const file of testFiles) {
        const localFile = path.join(localTestDir, file);
        assert.strictEqual(fs.existsSync(localFile), true);
      }
    });

    it('should detect and sync modified files', async function() {
      this.timeout(15000);

      const testFile = 'modified-file.txt';
      const sftp = sshManager.getSFTP();

      // Create initial file
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(`${remoteTestDir}/${testFile}`, 'Original content', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // First sync
      let remoteFiles = await syncEngine.scanRemoteDirectory();
      let changes = syncEngine.detectChanges(remoteFiles);
      const addChange = changes.find(c => c.path === testFile);
      if (addChange) {
        await syncEngine.downloadFile(addChange.path);
        syncEngine.updateSnapshot(addChange.path, addChange.remoteMtime!, addChange.size!);
      }

      // Modify remote file
      await new Promise(resolve => setTimeout(resolve, 1000));
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(`${remoteTestDir}/${testFile}`, 'Modified content', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Second sync
      remoteFiles = await syncEngine.scanRemoteDirectory();
      changes = syncEngine.detectChanges(remoteFiles);
      const modChange = changes.find(c => c.path === testFile);

      assert.ok(modChange);
      assert.strictEqual(modChange.type, 'modified');
    });

    it('should backup locally modified files before overwriting', async function() {
      this.timeout(15000);

      const testFile = 'backup-test.txt';
      const localFile = path.join(localTestDir, testFile);
      const sftp = sshManager.getSFTP();

      // Create and sync initial file
      await new Promise<void>((resolve, reject) => {
        sftp.writeFile(`${remoteTestDir}/${testFile}`, 'Remote content', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      let remoteFiles = await syncEngine.scanRemoteDirectory();
      let changes = syncEngine.detectChanges(remoteFiles);
      const change = changes.find(c => c.path === testFile);
      if (change) {
        await syncEngine.downloadFile(change.path);
        syncEngine.updateSnapshot(change.path, change.remoteMtime!, change.size!);
      }

      // Modify local file
      await new Promise(resolve => setTimeout(resolve, 1000));
      fs.writeFileSync(localFile, 'Local modification');

      // Check if backup is needed
      const snapshot = dbManager.getSnapshot('e2e-test', testFile);
      const isModified = backupManager.isLocallyModified(testFile, snapshot!.localMtime);
      assert.strictEqual(isModified, true);

      // Create backup
      const backupPath = await backupManager.createBackup(testFile);
      assert.ok(fs.existsSync(backupPath));
    });
  });

  describe('Scheduler Integration', () => {
    it('should run scheduled sync', function(done) {
      this.timeout(10000);

      scheduler = new SyncScheduler(
        'e2e-test',
        syncEngine,
        backupManager,
        dbManager,
        { syncInterval: 2, enabled: true }
      );

      let syncCompleted = false;
      scheduler.on('syncComplete', () => {
        syncCompleted = true;
        scheduler.stop();
        assert.strictEqual(syncCompleted, true);
        done();
      });

      scheduler.start();
    });
  });
});
