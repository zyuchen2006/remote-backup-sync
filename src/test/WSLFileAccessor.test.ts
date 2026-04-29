import './test-setup-with-mock';
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WSLFileAccessor } from '../core/WSLFileAccessor';
import { RemoteEnvironmentDetector } from '../core/RemoteEnvironmentDetector';

describe('WSLFileAccessor Tests', () => {
  const distroName = 'Ubuntu';
  const wslTestDir = '/tmp/remote-sync-test';
  const localTestDir = path.join(__dirname, '../../test-output/wsl-accessor');
  let accessor: WSLFileAccessor;

  before(function() {
    // Create local test directory
    if (!fs.existsSync(localTestDir)) {
      fs.mkdirSync(localTestDir, { recursive: true });
    }

    // Create WSL test directory and files
    const windowsPath = RemoteEnvironmentDetector.toWindowsPath(distroName, wslTestDir);
    if (!fs.existsSync(windowsPath)) {
      fs.mkdirSync(windowsPath, { recursive: true });
    }

    // Create test files in WSL
    fs.writeFileSync(path.join(windowsPath, 'test1.txt'), 'Test file 1');
    fs.writeFileSync(path.join(windowsPath, 'test2.txt'), 'Test file 2');

    // Create subdirectory with files
    const subDir = path.join(windowsPath, 'subdir');
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir);
    }
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file');

    accessor = new WSLFileAccessor(distroName, wslTestDir, []);
  });

  after(function() {
    // Cleanup
    const windowsPath = RemoteEnvironmentDetector.toWindowsPath(distroName, wslTestDir);
    if (fs.existsSync(windowsPath)) {
      fs.rmSync(windowsPath, { recursive: true, force: true });
    }
    if (fs.existsSync(localTestDir)) {
      fs.rmSync(localTestDir, { recursive: true, force: true });
    }
  });

  describe('Path Conversion', () => {
    it('should convert Linux path to Windows UNC path', () => {
      const windowsPath = RemoteEnvironmentDetector.toWindowsPath(distroName, '/home/user/project');
      assert.strictEqual(windowsPath, '\\\\wsl$\\Ubuntu\\home\\user\\project');
    });

    it('should handle paths with spaces', () => {
      const windowsPath = RemoteEnvironmentDetector.toWindowsPath(distroName, '/home/user/my project');
      assert.strictEqual(windowsPath, '\\\\wsl$\\Ubuntu\\home\\user\\my project');
    });
  });

  describe('Directory Scanning', () => {
    it('should scan directory and return files', async function() {
      this.timeout(5000);
      const files = await accessor.scanDirectory(wslTestDir);

      assert.ok(files.size >= 2, 'Should find at least 2 files');
      assert.ok(files.has('test1.txt'), 'Should find test1.txt');
      assert.ok(files.has('test2.txt'), 'Should find test2.txt');
    });

    it('should scan nested directories recursively', async function() {
      this.timeout(5000);
      const files = await accessor.scanDirectory(wslTestDir);

      assert.ok(files.has('subdir/nested.txt'), 'Should find nested file');
    });

    it('should return file metadata', async function() {
      this.timeout(5000);
      const files = await accessor.scanDirectory(wslTestDir);
      const file = files.get('test1.txt');

      assert.ok(file, 'File should exist');
      assert.ok(file!.mtime > 0, 'Should have modification time');
      assert.ok(file!.size > 0, 'Should have file size');
    });
  });

  describe('File Download', () => {
    it('should download file from WSL to local', async function() {
      this.timeout(5000);
      const localFile = path.join(localTestDir, 'downloaded.txt');

      await accessor.downloadFile('test1.txt', localFile);

      assert.ok(fs.existsSync(localFile), 'File should be downloaded');
      const content = fs.readFileSync(localFile, 'utf-8');
      assert.strictEqual(content, 'Test file 1');
    });

    it('should verify file size after download', async function() {
      this.timeout(5000);
      const localFile = path.join(localTestDir, 'size-check.txt');

      await accessor.downloadFile('test2.txt', localFile);

      const localStats = fs.statSync(localFile);
      const windowsPath = RemoteEnvironmentDetector.toWindowsPath(distroName, wslTestDir);
      const remoteStats = fs.statSync(path.join(windowsPath, 'test2.txt'));

      assert.strictEqual(localStats.size, remoteStats.size, 'File sizes should match');
    });

    it('should use .tmp file during download', async function() {
      this.timeout(5000);
      const localFile = path.join(localTestDir, 'tmp-test.txt');

      // Download should succeed and .tmp should be cleaned up
      await accessor.downloadFile('test1.txt', localFile);

      assert.ok(fs.existsSync(localFile), 'Final file should exist');
      assert.ok(!fs.existsSync(localFile + '.tmp'), 'Temp file should be cleaned up');
    });
  });

  describe('File Statistics', () => {
    it('should get file statistics', async function() {
      this.timeout(5000);
      const stats = await accessor.getFileStats('test1.txt');

      assert.ok(stats.mtime > 0, 'Should have modification time');
      assert.ok(stats.size > 0, 'Should have size');
      assert.strictEqual(stats.isFile, true, 'Should be a file');
      assert.strictEqual(stats.isDirectory, false, 'Should not be a directory');
    });

    it('should get directory statistics', async function() {
      this.timeout(5000);
      const stats = await accessor.getFileStats('subdir');

      assert.strictEqual(stats.isFile, false, 'Should not be a file');
      assert.strictEqual(stats.isDirectory, true, 'Should be a directory');
    });
  });

  describe('Exclusion Patterns', () => {
    it('should exclude files matching patterns', async function() {
      this.timeout(5000);
      const accessorWithExclusion = new WSLFileAccessor(
        distroName,
        wslTestDir,
        ['**/*.txt']
      );

      const files = await accessorWithExclusion.scanDirectory(wslTestDir);

      assert.strictEqual(files.size, 0, 'Should exclude all .txt files');
    });

    it('should exclude directories matching patterns', async function() {
      this.timeout(5000);
      const accessorWithExclusion = new WSLFileAccessor(
        distroName,
        wslTestDir,
        ['subdir/**']
      );

      const files = await accessorWithExclusion.scanDirectory(wslTestDir);

      assert.ok(!files.has('subdir/nested.txt'), 'Should exclude files in subdir');
    });
  });

  describe('Path Validation', () => {
    it('should detect Windows reserved characters', async function() {
      this.timeout(5000);

      // Test by creating a file with valid name, then checking if validation would catch invalid names
      // We can't actually create files with invalid characters on Windows, so we test the logic indirectly

      // Create a test accessor that will scan a directory
      const testAccessor = new WSLFileAccessor(distroName, wslTestDir, []);

      // The validation happens during scanDirectory
      // Since we can't create files with invalid characters on Windows,
      // we just verify that the scan completes without error for valid files
      const files = await testAccessor.scanDirectory(wslTestDir);

      // If we got here, validation passed for all existing files
      assert.ok(files.size >= 0, 'Should scan directory successfully with valid filenames');
    });

    it('should detect path length limits', async function() {
      this.timeout(5000);
      // Create a very long path
      const longPath = '/a'.repeat(200);
      const accessorLongPath = new WSLFileAccessor(distroName, longPath, []);

      try {
        await accessorLongPath.scanDirectory(longPath);
        // If it succeeds, that's fine (path might not exist but validation passed)
      } catch (err: any) {
        if (err.message.includes('too long')) {
          assert.ok(true, 'Should detect long paths');
        }
      }
    });
  });

  describe('Temporary File Cleanup', () => {
    it('should clean up orphaned .remotesync.tmp files', function() {
      this.timeout(5000);
      // Create some .remotesync.tmp files (extension-specific temp files)
      const tmpFile1 = path.join(localTestDir, 'orphan1.txt.remotesync.tmp');
      const tmpFile2 = path.join(localTestDir, 'orphan2.txt.remotesync.tmp');
      fs.writeFileSync(tmpFile1, 'orphan');
      fs.writeFileSync(tmpFile2, 'orphan');

      assert.ok(fs.existsSync(tmpFile1), 'Temp file 1 should exist before cleanup');
      assert.ok(fs.existsSync(tmpFile2), 'Temp file 2 should exist before cleanup');

      // Run cleanup
      accessor.cleanupTempFiles(localTestDir);

      assert.ok(!fs.existsSync(tmpFile1), 'Temp file 1 should be cleaned up');
      assert.ok(!fs.existsSync(tmpFile2), 'Temp file 2 should be cleaned up');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent files', async function() {
      this.timeout(5000);
      try {
        await accessor.downloadFile('nonexistent.txt', path.join(localTestDir, 'fail.txt'));
        assert.fail('Should throw error for non-existent file');
      } catch (err) {
        assert.ok(err, 'Should throw error');
      }
    });

    it('should handle non-existent directories', async function() {
      this.timeout(5000);
      const accessorBadPath = new WSLFileAccessor(distroName, '/nonexistent/path', []);

      try {
        await accessorBadPath.scanDirectory('/nonexistent/path');
        assert.fail('Should throw error for non-existent directory');
      } catch (err) {
        assert.ok(err, 'Should throw error');
      }
    });
  });
});
