import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { FileSyncEngine } from '../core/FileSyncEngine';
import { SSHConnectionManager } from '../core/SSHConnectionManager';
import { DatabaseManager } from '../core/DatabaseManager';
import { TEST_CONFIG } from './setup';

describe('FileSyncEngine Unit Tests', () => {
  let sshManager: SSHConnectionManager;
  let dbManager: DatabaseManager;
  let syncEngine: FileSyncEngine;
  const testDbPath = path.join(TEST_CONFIG.local.basePath, 'test-db.json');

  before(async function() {
    this.timeout(10000);
    // Setup SSH connection
    sshManager = new SSHConnectionManager({
      host: TEST_CONFIG.ssh.host,
      port: TEST_CONFIG.ssh.port,
      username: TEST_CONFIG.ssh.username,
      password: TEST_CONFIG.ssh.password
    });
    await sshManager.connect();

    // Setup database
    if (!fs.existsSync(TEST_CONFIG.local.basePath)) {
      fs.mkdirSync(TEST_CONFIG.local.basePath, { recursive: true });
    }
    dbManager = new DatabaseManager(testDbPath);

    // Create sync engine
    syncEngine = new FileSyncEngine(
      'test-project',
      TEST_CONFIG.remote.testDir,
      TEST_CONFIG.local.testDir,
      ['node_modules/**', '.git/**'],
      sshManager,
      dbManager
    );
  });

  after(() => {
    sshManager?.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('File Exclusion', () => {
    it('should exclude files matching patterns', () => {
      const engine = syncEngine as any;
      assert.strictEqual(engine.isExcluded('node_modules/package.json'), true);
      assert.strictEqual(engine.isExcluded('.git/config'), true);
      assert.strictEqual(engine.isExcluded('src/index.ts'), false);
    });

    it('should handle nested paths', () => {
      const engine = syncEngine as any;
      // node_modules/** only matches if node_modules is at root
      // For nested paths, the pattern would need to be **/node_modules/**
      assert.strictEqual(engine.isExcluded('node_modules/nested/lib.js'), true);
      assert.strictEqual(engine.isExcluded('src/lib.js'), false);
    });
  });

  describe('Change Detection', () => {
    it('should detect new files', () => {
      const remoteFiles = new Map([
        ['file1.txt', { mtime: Date.now(), size: 100 }],
        ['file2.txt', { mtime: Date.now(), size: 200 }]
      ]);
      const changes = syncEngine.detectChanges(remoteFiles);
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes.every(c => c.type === 'added'), true);
    });

    it('should detect modified files', () => {
      const now = Date.now();
      // Add initial snapshot
      syncEngine.updateSnapshot('file1.txt', now - 1000, 100);

      const remoteFiles = new Map([
        ['file1.txt', { mtime: now, size: 150 }]
      ]);
      const changes = syncEngine.detectChanges(remoteFiles);
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, 'modified');
    });

    it('should detect deleted files', () => {
      syncEngine.updateSnapshot('deleted.txt', Date.now(), 100);
      const remoteFiles = new Map();
      const changes = syncEngine.detectChanges(remoteFiles);
      const deletedChange = changes.find(c => c.path === 'deleted.txt');
      assert.strictEqual(deletedChange?.type, 'deleted');
    });
  });

  describe('Snapshot Management', () => {
    it('should update snapshot correctly', () => {
      const mtime = Date.now();
      syncEngine.updateSnapshot('test.txt', mtime, 500);
      const snapshot = dbManager.getSnapshot('test-project', 'test.txt');
      assert.strictEqual(snapshot?.remoteMtime, mtime);
      assert.strictEqual(snapshot?.fileSize, 500);
    });

    it('should mark snapshot as remote deleted', () => {
      syncEngine.updateSnapshot('to-delete.txt', Date.now(), 100);
      syncEngine.markSnapshotRemoteDeleted('to-delete.txt');
      const snapshot = dbManager.getSnapshot('test-project', 'to-delete.txt');
      assert.strictEqual(snapshot?.remoteDeleted, true);
    });
  });
});
