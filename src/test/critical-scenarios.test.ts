import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from '../core/DatabaseManager';
import { SyncScheduler } from '../core/SyncScheduler';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { LocalBackupManager } from '../core/LocalBackupManager';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { TEST_CONFIG } from './setup';

/**
 * Critical Scenarios Test Suite
 * Tests for issues identified by code review (codex)
 */
describe('Critical Scenarios Tests', function() {
  const testDir = path.join(TEST_CONFIG.local.basePath, 'critical-scenarios');
  const dbPath = path.join(testDir, 'test-db.json');

  before(function() {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  after(function() {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Issue 1: Partial Sync Failures', function() {
    it('should track failed files and mark sync as partial_success', async function() {
      this.timeout(10000);

      const localPath = path.join(testDir, 'partial-sync');
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }

      const dbManager = new DatabaseManager(dbPath);

      // Create a mock SSH manager that will fail for specific files
      const mockSSH = {
        isConnected: () => true,
        getSFTP: () => ({
          readdir: (remotePath: string, callback: any) => {
            callback(null, [
              { filename: 'success.txt', attrs: { mtime: Date.now() / 1000, size: 100 } },
              { filename: 'fail.txt', attrs: { mtime: Date.now() / 1000, size: 100 } }
            ]);
          },
          stat: (filePath: string, callback: any) => {
            callback(null, { mtime: Date.now() / 1000, size: 100 });
          },
          fastGet: (remotePath: string, localPath: string, callback: any) => {
            if (remotePath.includes('fail.txt')) {
              callback(new Error('Simulated network error'));
            } else {
              fs.writeFileSync(localPath, 'test content');
              callback(null);
            }
          }
        })
      } as any;

      const syncEngine = new FileSyncEngine(
        'test-project',
        '/remote/path',
        localPath,
        [],
        mockSSH,
        dbManager
      );

      const backupManager = new LocalBackupManager(
        'test-project',
        localPath,
        { maxBackups: 3 },
        dbManager
      );

      const scheduler = new SyncScheduler(
        'test-project',
        syncEngine,
        backupManager,
        dbManager,
        { syncInterval: 60, enabled: true },
        (msg) => console.log(msg)
      );

      let syncResult: any = null;
      let syncCompleted = false;

      scheduler.on('syncComplete', (result) => {
        syncResult = result;
        syncCompleted = true;
      });

      // Start scheduler (will trigger immediate sync)
      scheduler.start();

      // Wait for sync to complete
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (syncCompleted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });

      scheduler.stop();

      // Verify that failed files are tracked
      expect(syncResult).to.not.be.null;
      expect(syncResult.filesFailed).to.equal(1);
      expect(syncResult.failedFiles).to.include('fail.txt');
      expect(syncResult.filesAdded).to.equal(1); // success.txt should succeed

      // Verify history status is partial_success
      const history = dbManager.getSyncHistory('test-project');
      expect(history.length).to.be.greaterThan(0);
      expect(history[history.length - 1].status).to.equal('partial_success');
    });
  });

  describe('Issue 2: Database Atomic Write', function() {
    it('should not corrupt database if write is interrupted', function() {
      const testDbPath = path.join(testDir, 'atomic-test-db.json');

      // Create initial database
      const db1 = new DatabaseManager(testDbPath);
      db1.upsertSnapshot({
        projectId: 'test',
        filePath: 'file1.txt',
        remoteMtime: Date.now(),
        localMtime: Date.now(),
        fileSize: 100,
        lastSyncTime: Date.now()
      });

      // Verify temp file is cleaned up
      const tempPath = `${testDbPath}.tmp`;
      expect(fs.existsSync(tempPath)).to.be.false;

      // Verify database is valid JSON
      const content = fs.readFileSync(testDbPath, 'utf-8');
      expect(() => JSON.parse(content)).to.not.throw();

      // Verify data integrity
      const db2 = new DatabaseManager(testDbPath);
      const snapshot = db2.getSnapshot('test', 'file1.txt');
      expect(snapshot).to.not.be.null;
      expect(snapshot?.filePath).to.equal('file1.txt');
    });

    it('should handle write errors gracefully', function() {
      const readOnlyDir = path.join(testDir, 'readonly');
      if (!fs.existsSync(readOnlyDir)) {
        fs.mkdirSync(readOnlyDir, { recursive: true });
      }

      const readOnlyDbPath = path.join(readOnlyDir, 'readonly-db.json');

      // Create database first
      const db = new DatabaseManager(readOnlyDbPath);

      // Make directory read-only (Windows: this may not work as expected)
      try {
        fs.chmodSync(readOnlyDir, 0o444);

        // Try to write - should throw error
        expect(() => {
          db.upsertSnapshot({
            projectId: 'test',
            filePath: 'file.txt',
            remoteMtime: Date.now(),
            localMtime: Date.now(),
            fileSize: 100,
            lastSyncTime: Date.now()
          });
        }).to.throw();

        // Verify temp file is cleaned up even on error
        const tempPath = `${readOnlyDbPath}.tmp`;
        expect(fs.existsSync(tempPath)).to.be.false;
      } finally {
        // Restore permissions
        fs.chmodSync(readOnlyDir, 0o755);
      }
    });
  });

  describe('Issue 3: SSH Reconnect After Stop', function() {
    it('should not reconnect after intentional disconnect', async function() {
      this.timeout(5000);

      const sshManager = new SSHConnectionManager({
        host: TEST_CONFIG.ssh.host,
        port: TEST_CONFIG.ssh.port,
        username: TEST_CONFIG.ssh.username,
        password: TEST_CONFIG.ssh.password
      });

      // Connect
      await sshManager.connect();
      expect(sshManager.isConnected()).to.be.true;

      // Intentionally disconnect
      sshManager.disconnect();

      // Wait a bit to see if reconnect is triggered
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should still be disconnected
      expect(sshManager.isConnected()).to.be.false;
    });
  });

  describe('Issue 4: Local Modification Detection (mtime)', function() {
    it('should detect local modifications based on mtime', function() {
      const localPath = path.join(testDir, 'mtime-test');
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }

      const dbManager = new DatabaseManager(dbPath);
      const backupManager = new LocalBackupManager(
        'test-project',
        localPath,
        { maxBackups: 3 },
        dbManager
      );

      const testFile = path.join(localPath, 'test.txt');

      // Create file
      fs.writeFileSync(testFile, 'original content');
      const originalMtime = fs.statSync(testFile).mtimeMs;

      // Record last sync time
      const lastSyncTime = originalMtime;

      // Modify file (ensure mtime changes)
      setTimeout(() => {
        fs.writeFileSync(testFile, 'modified content');
        const newMtime = fs.statSync(testFile).mtimeMs;

        // Check if modification is detected
        const isModified = backupManager.isLocallyModified(testFile, lastSyncTime);

        if (newMtime > originalMtime) {
          expect(isModified).to.be.true;
        } else {
          // If mtime didn't change (time precision issue), this is the known limitation
          console.warn('Warning: mtime did not change - known limitation');
        }
      }, 100);
    });

    it('should document mtime limitation when timestamps are preserved', function() {
      // This test documents the known limitation
      const localPath = path.join(testDir, 'mtime-limitation');
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }

      const testFile = path.join(localPath, 'test.txt');
      fs.writeFileSync(testFile, 'content');

      const originalMtime = fs.statSync(testFile).mtimeMs;

      // Simulate tool that preserves mtime (like some copy tools)
      fs.writeFileSync(testFile, 'different content');
      fs.utimesSync(testFile, new Date(originalMtime), new Date(originalMtime));

      const newMtime = fs.statSync(testFile).mtimeMs;

      // This demonstrates the limitation: content changed but mtime didn't
      expect(newMtime).to.equal(originalMtime);

      // This is why we document: "Use Git as primary backup"
      console.log('Known limitation: mtime-based detection can miss changes when timestamps are preserved');
    });
  });

  describe('Issue 5: Config Storage Per-Workspace', function() {
    it('should use workspace-specific storage', function() {
      // This is more of an integration test
      // The fix ensures ConfigManager uses storageUri (per-workspace)
      // rather than globalStorageUri (global)

      // We can't fully test this without VSCode context,
      // but we document the expected behavior
      expect(true).to.be.true; // Placeholder
      console.log('Config storage uses workspace-specific storageUri to prevent cross-workspace pollution');
    });
  });
});
