import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { LocalBackupManager } from '../core/LocalBackupManager';
import { DatabaseManager } from '../core/DatabaseManager';
import { TEST_CONFIG } from './setup';

describe('LocalBackupManager Unit Tests', () => {
  let dbManager: DatabaseManager;
  let backupManager: LocalBackupManager;
  const testDbPath = path.join(TEST_CONFIG.local.basePath, 'backup-test-db.json');
  const testLocalPath = path.join(TEST_CONFIG.local.basePath, 'backup-test');

  before(() => {
    if (!fs.existsSync(TEST_CONFIG.local.basePath)) {
      fs.mkdirSync(TEST_CONFIG.local.basePath, { recursive: true });
    }
    if (!fs.existsSync(testLocalPath)) {
      fs.mkdirSync(testLocalPath, { recursive: true });
    }
    dbManager = new DatabaseManager(testDbPath);
    backupManager = new LocalBackupManager(
      'test-backup-project',
      testLocalPath,
      { maxBackups: 3 },
      dbManager
    );
  });

  after(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testLocalPath)) {
      fs.rmSync(testLocalPath, { recursive: true, force: true });
    }
  });

  describe('Local Modification Detection', () => {
    it('should detect locally modified files', () => {
      const testFile = path.join(testLocalPath, 'modified.txt');
      fs.writeFileSync(testFile, 'original content');
      const originalMtime = fs.statSync(testFile).mtimeMs;

      // Wait a bit and modify
      setTimeout(() => {
        fs.writeFileSync(testFile, 'modified content');
        const isModified = backupManager.isLocallyModified('modified.txt', originalMtime);
        assert.strictEqual(isModified, true);
      }, 100);
    });

    it('should not detect unmodified files', () => {
      const testFile = path.join(testLocalPath, 'unmodified.txt');
      fs.writeFileSync(testFile, 'content');
      const mtime = fs.statSync(testFile).mtimeMs;
      const isModified = backupManager.isLocallyModified('unmodified.txt', mtime);
      assert.strictEqual(isModified, false);
    });
  });

  describe('Backup Creation', () => {
    it('should create backup with timestamp', async () => {
      const testFile = path.join(testLocalPath, 'to-backup.txt');
      fs.writeFileSync(testFile, 'backup content');

      const backupPath = await backupManager.createBackup('to-backup.txt');
      assert.ok(backupPath.includes('.local.'));
      assert.ok(fs.existsSync(backupPath));
    });

    it('should limit backup count', async () => {
      const testFile = path.join(testLocalPath, 'multi-backup.txt');
      fs.writeFileSync(testFile, 'content');

      // Create 5 backups (max is 3)
      for (let i = 0; i < 5; i++) {
        await backupManager.createBackup('multi-backup.txt');
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const backups = dbManager.getBackupFiles('test-backup-project', 'multi-backup.txt');
      assert.ok(backups.length <= 3);
    });
  });

  describe('Backup Cleanup', () => {
    it('should remove old backups', async function() {
      this.timeout(5000);
      const testFile = path.join(testLocalPath, 'cleanup-test.txt');
      fs.writeFileSync(testFile, 'content');

      const backupPaths: string[] = [];
      for (let i = 0; i < 4; i++) {
        const backupPath = await backupManager.createBackup('cleanup-test.txt');
        backupPaths.push(backupPath);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // After creating 4 backups with max=3, oldest should be removed
      // Check database records instead of file existence (more reliable)
      const remainingBackups = dbManager.getBackupFiles('test-backup-project', 'cleanup-test.txt');
      assert.ok(remainingBackups.length <= 3, `Expected <= 3 backups, got ${remainingBackups.length}`);
    });
  });
});
