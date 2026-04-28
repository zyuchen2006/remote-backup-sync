/**
 * WSL Core Functionality Test
 * Tests WSLFileAccessor without VSCode dependencies
 */

import * as fs from 'fs';
import * as path from 'path';
import { WSLFileAccessor } from './src/core/WSLFileAccessor';

// Test configuration
const DISTRO_NAME = 'Ubuntu';
const WSL_TEST_DIR = '/tmp/remote-sync-test-core';
const LOCAL_TEST_DIR = path.join(__dirname, 'test-output/wsl-core');

// Helper: Convert Linux path to Windows UNC path
function toWindowsPath(distroName: string, linuxPath: string): string {
  const normalizedPath = linuxPath.replace(/\\/g, '/');
  return `\\\\wsl$\\${distroName}${normalizedPath}`;
}

// Setup
function setup() {
  console.log('\n=== Setup ===');
  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  if (fs.existsSync(windowsPath)) {
    fs.rmSync(windowsPath, { recursive: true, force: true });
  }

  fs.mkdirSync(windowsPath, { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(windowsPath, 'file1.txt'), 'Content 1');
  fs.writeFileSync(path.join(windowsPath, 'file2.txt'), 'Content 2');
  fs.writeFileSync(path.join(windowsPath, 'file3.log'), 'Log content');

  // Create subdirectory
  const subDir = path.join(windowsPath, 'subdir');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested content');

  // Create deeper nesting
  const deepDir = path.join(subDir, 'deep');
  fs.mkdirSync(deepDir);
  fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'Deep content');

  if (!fs.existsSync(LOCAL_TEST_DIR)) {
    fs.mkdirSync(LOCAL_TEST_DIR, { recursive: true });
  }

  console.log('✓ Test environment created');
}

// Cleanup
function cleanup() {
  console.log('\n=== Cleanup ===');
  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  if (fs.existsSync(windowsPath)) {
    fs.rmSync(windowsPath, { recursive: true, force: true });
  }

  if (fs.existsSync(LOCAL_TEST_DIR)) {
    fs.rmSync(LOCAL_TEST_DIR, { recursive: true, force: true });
  }

  console.log('✓ Cleanup complete');
}

// Main test
async function runTests() {
  console.log('========================================');
  console.log('WSL Core Functionality Tests');
  console.log('========================================');
  console.log(`Distribution: ${DISTRO_NAME}`);
  console.log(`WSL Test Dir: ${WSL_TEST_DIR}`);
  console.log(`Local Test Dir: ${LOCAL_TEST_DIR}`);

  setup();

  const results: boolean[] = [];

  try {
    // Test 1: Create accessor
    console.log('\n=== Test 1: Create WSLFileAccessor ===');
    const accessor = new WSLFileAccessor(DISTRO_NAME, WSL_TEST_DIR, []);
    console.log('✓ Accessor created successfully');
    results.push(true);

    // Test 2: Scan directory
    console.log('\n=== Test 2: Scan Directory ===');
    const files = await accessor.scanDirectory(WSL_TEST_DIR);
    console.log(`  Found ${files.size} files`);

    const fileList = Array.from(files.keys()).sort();
    console.log(`  Files: ${fileList.join(', ')}`);

    const hasFile1 = files.has('file1.txt');
    const hasFile2 = files.has('file2.txt');
    const hasNested = files.has('subdir/nested.txt');
    const hasDeep = files.has('subdir/deep/deep.txt');

    if (hasFile1 && hasFile2 && hasNested && hasDeep) {
      console.log('✓ All expected files found');
      results.push(true);
    } else {
      console.log('✗ Missing files');
      results.push(false);
    }

    // Test 3: File metadata
    console.log('\n=== Test 3: File Metadata ===');
    const file1Info = files.get('file1.txt');
    if (file1Info) {
      console.log(`  mtime: ${file1Info.mtime}`);
      console.log(`  size: ${file1Info.size}`);

      if (file1Info.mtime > 0 && file1Info.size === 9) {
        console.log('✓ Metadata correct');
        results.push(true);
      } else {
        console.log('✗ Invalid metadata');
        results.push(false);
      }
    } else {
      console.log('✗ File not found');
      results.push(false);
    }

    // Test 4: Download file
    console.log('\n=== Test 4: Download File ===');
    const localFile = path.join(LOCAL_TEST_DIR, 'downloaded.txt');
    await accessor.downloadFile('file1.txt', localFile);

    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, 'utf-8');
      if (content === 'Content 1') {
        console.log('✓ File downloaded correctly');
        results.push(true);
      } else {
        console.log(`✗ Content mismatch: "${content}"`);
        results.push(false);
      }
    } else {
      console.log('✗ File not downloaded');
      results.push(false);
    }

    // Test 5: Download nested file
    console.log('\n=== Test 5: Download Nested File ===');
    const nestedLocal = path.join(LOCAL_TEST_DIR, 'nested-download.txt');
    await accessor.downloadFile('subdir/nested.txt', nestedLocal);

    if (fs.existsSync(nestedLocal)) {
      const content = fs.readFileSync(nestedLocal, 'utf-8');
      if (content === 'Nested content') {
        console.log('✓ Nested file downloaded correctly');
        results.push(true);
      } else {
        console.log('✗ Content mismatch');
        results.push(false);
      }
    } else {
      console.log('✗ File not downloaded');
      results.push(false);
    }

    // Test 6: Exclusion patterns
    console.log('\n=== Test 6: Exclusion Patterns ===');
    const accessor2 = new WSLFileAccessor(DISTRO_NAME, WSL_TEST_DIR, ['*.log']);
    const files2 = await accessor2.scanDirectory(WSL_TEST_DIR);

    const hasLog = files2.has('file3.log');
    const hasTxt = files2.has('file1.txt');

    if (!hasLog && hasTxt) {
      console.log('✓ Exclusion patterns work');
      results.push(true);
    } else {
      console.log(`✗ Exclusion failed: hasLog=${hasLog}, hasTxt=${hasTxt}`);
      results.push(false);
    }

    // Test 7: Get file stats
    console.log('\n=== Test 7: Get File Stats ===');
    const stats = await accessor.getFileStats('file1.txt');
    console.log(`  mtime: ${stats.mtime}`);
    console.log(`  size: ${stats.size}`);
    console.log(`  isFile: ${stats.isFile}`);
    console.log(`  isDirectory: ${stats.isDirectory}`);

    if (stats.isFile && !stats.isDirectory && stats.size === 9) {
      console.log('✓ File stats correct');
      results.push(true);
    } else {
      console.log('✗ Invalid stats');
      results.push(false);
    }

    // Test 8: Directory stats
    console.log('\n=== Test 8: Directory Stats ===');
    const dirStats = await accessor.getFileStats('subdir');

    if (!dirStats.isFile && dirStats.isDirectory) {
      console.log('✓ Directory stats correct');
      results.push(true);
    } else {
      console.log('✗ Invalid directory stats');
      results.push(false);
    }

    // Test 9: Cleanup temp files
    console.log('\n=== Test 9: Cleanup Temp Files ===');
    const tmp1 = path.join(LOCAL_TEST_DIR, 'orphan1.tmp');
    const tmp2 = path.join(LOCAL_TEST_DIR, 'orphan2.tmp');
    fs.writeFileSync(tmp1, 'temp');
    fs.writeFileSync(tmp2, 'temp');

    accessor.cleanupTempFiles(LOCAL_TEST_DIR);

    if (!fs.existsSync(tmp1) && !fs.existsSync(tmp2)) {
      console.log('✓ Temp files cleaned up');
      results.push(true);
    } else {
      console.log('✗ Cleanup failed');
      results.push(false);
    }

    // Summary
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');
    const passed = results.filter(r => r).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);

    if (passed === total) {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    } else {
      console.log(`\n✗ ${total - passed} test(s) failed`);
      process.exit(1);
    }

  } catch (err) {
    console.error('\n✗ Test error:', err);
    process.exit(1);
  } finally {
    cleanup();
  }
}

runTests();
