/**
 * Standalone WSL functionality test
 * Run with: node dist/test-wsl-standalone.js
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const DISTRO_NAME = 'Ubuntu';
const WSL_TEST_DIR = '/tmp/remote-sync-test';
const LOCAL_TEST_DIR = path.join(__dirname, '../test-output/wsl-standalone');

// Helper: Convert Linux path to Windows UNC path
function toWindowsPath(distroName, linuxPath) {
  const normalizedPath = linuxPath.replace(/\\/g, '/');
  return `\\\\wsl$\\${distroName}${normalizedPath}`;
}

// Test 1: Path conversion
function testPathConversion() {
  console.log('\n=== Test 1: Path Conversion ===');

  const result = toWindowsPath('Ubuntu', '/home/user/project');
  const expected = '\\\\wsl$\\Ubuntu/home/user/project'; // Note: forward slashes are normalized

  if (result === expected) {
    console.log('✓ Path conversion works correctly');
    return true;
  } else {
    console.log(`✗ Path conversion failed: expected ${expected}, got ${result}`);
    return false;
  }
}

// Test 2: WSL directory access
function testWSLAccess() {
  console.log('\n=== Test 2: WSL Directory Access ===');

  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  try {
    // Create test directory in WSL
    if (!fs.existsSync(windowsPath)) {
      fs.mkdirSync(windowsPath, { recursive: true });
    }

    // Create test file
    const testFile = path.join(windowsPath, 'test-access.txt');
    fs.writeFileSync(testFile, 'WSL access test');

    // Read it back
    const content = fs.readFileSync(testFile, 'utf-8');

    if (content === 'WSL access test') {
      console.log('✓ Can read/write files in WSL via \\\\wsl$ path');
      return true;
    } else {
      console.log('✗ File content mismatch');
      return false;
    }
  } catch (err) {
    console.log(`✗ WSL access failed: ${err.message}`);
    return false;
  }
}

// Test 3: Directory scanning
function testDirectoryScanning() {
  console.log('\n=== Test 3: Directory Scanning ===');

  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  try {
    // Create multiple test files
    fs.writeFileSync(path.join(windowsPath, 'file1.txt'), 'File 1');
    fs.writeFileSync(path.join(windowsPath, 'file2.txt'), 'File 2');

    // Create subdirectory
    const subDir = path.join(windowsPath, 'subdir');
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir);
    }
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file');

    // Scan directory
    const files = fs.readdirSync(windowsPath);

    console.log(`  Found ${files.length} items in WSL directory`);
    console.log(`  Items: ${files.join(', ')}`);

    if (files.includes('file1.txt') && files.includes('file2.txt') && files.includes('subdir')) {
      console.log('✓ Directory scanning works correctly');
      return true;
    } else {
      console.log('✗ Missing expected files');
      return false;
    }
  } catch (err) {
    console.log(`✗ Directory scanning failed: ${err.message}`);
    return false;
  }
}

// Test 4: File copy from WSL to Windows
function testFileCopy() {
  console.log('\n=== Test 4: File Copy WSL → Windows ===');

  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  try {
    // Ensure local directory exists
    if (!fs.existsSync(LOCAL_TEST_DIR)) {
      fs.mkdirSync(LOCAL_TEST_DIR, { recursive: true });
    }

    // Create source file in WSL
    const sourceFile = path.join(windowsPath, 'copy-test.txt');
    const sourceContent = 'Test file for copying';
    fs.writeFileSync(sourceFile, sourceContent);

    // Copy to local Windows directory
    const destFile = path.join(LOCAL_TEST_DIR, 'copied.txt');
    fs.copyFileSync(sourceFile, destFile);

    // Verify
    const destContent = fs.readFileSync(destFile, 'utf-8');

    if (destContent === sourceContent) {
      console.log('✓ File copy from WSL to Windows works correctly');
      return true;
    } else {
      console.log('✗ File content mismatch after copy');
      return false;
    }
  } catch (err) {
    console.log(`✗ File copy failed: ${err.message}`);
    return false;
  }
}

// Test 5: File size verification
function testFileSizeVerification() {
  console.log('\n=== Test 5: File Size Verification ===');

  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  try {
    // Create file with known size
    const testFile = path.join(windowsPath, 'size-test.txt');
    const content = 'A'.repeat(1000); // 1000 bytes
    fs.writeFileSync(testFile, content);

    // Get stats
    const stats = fs.statSync(testFile);

    if (stats.size === 1000) {
      console.log(`✓ File size verification works (${stats.size} bytes)`);
      return true;
    } else {
      console.log(`✗ File size mismatch: expected 1000, got ${stats.size}`);
      return false;
    }
  } catch (err) {
    console.log(`✗ File size verification failed: ${err.message}`);
    return false;
  }
}

// Test 6: Recursive directory scanning
function testRecursiveScanning() {
  console.log('\n=== Test 6: Recursive Directory Scanning ===');

  const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);

  try {
    // Create nested structure
    const level1 = path.join(windowsPath, 'level1');
    const level2 = path.join(level1, 'level2');
    const level3 = path.join(level2, 'level3');

    fs.mkdirSync(level1, { recursive: true });
    fs.mkdirSync(level2, { recursive: true });
    fs.mkdirSync(level3, { recursive: true });

    fs.writeFileSync(path.join(level1, 'file1.txt'), 'Level 1');
    fs.writeFileSync(path.join(level2, 'file2.txt'), 'Level 2');
    fs.writeFileSync(path.join(level3, 'file3.txt'), 'Level 3');

    // Recursive scan function
    function scanRecursive(dir, files = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanRecursive(fullPath, files);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allFiles = scanRecursive(windowsPath);
    const txtFiles = allFiles.filter(f => f.endsWith('.txt'));

    console.log(`  Found ${txtFiles.length} .txt files recursively`);

    if (txtFiles.length >= 3) {
      console.log('✓ Recursive scanning works correctly');
      return true;
    } else {
      console.log('✗ Did not find all nested files');
      return false;
    }
  } catch (err) {
    console.log(`✗ Recursive scanning failed: ${err.message}`);
    return false;
  }
}

// Cleanup function
function cleanup() {
  console.log('\n=== Cleanup ===');

  try {
    const windowsPath = toWindowsPath(DISTRO_NAME, WSL_TEST_DIR);
    if (fs.existsSync(windowsPath)) {
      fs.rmSync(windowsPath, { recursive: true, force: true });
      console.log('✓ Cleaned up WSL test directory');
    }

    if (fs.existsSync(LOCAL_TEST_DIR)) {
      fs.rmSync(LOCAL_TEST_DIR, { recursive: true, force: true });
      console.log('✓ Cleaned up local test directory');
    }
  } catch (err) {
    console.log(`⚠ Cleanup warning: ${err.message}`);
  }
}

// Main test runner
function runTests() {
  console.log('========================================');
  console.log('WSL Functionality Standalone Tests');
  console.log('========================================');
  console.log(`WSL Distribution: ${DISTRO_NAME}`);
  console.log(`WSL Test Directory: ${WSL_TEST_DIR}`);
  console.log(`Local Test Directory: ${LOCAL_TEST_DIR}`);

  const results = [];

  results.push(testPathConversion());
  results.push(testWSLAccess());
  results.push(testDirectoryScanning());
  results.push(testFileCopy());
  results.push(testFileSizeVerification());
  results.push(testRecursiveScanning());

  cleanup();

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
}

// Run tests
runTests();
