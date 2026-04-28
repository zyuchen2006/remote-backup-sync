# Testing Guide

## Environment Variables

The test suite uses environment variables for sensitive configuration. This prevents credentials from being committed to the repository.

### Required Environment Variables

For SSH tests:
```bash
TEST_SSH_PASSWORD=your_password
```

### Optional Environment Variables

```bash
# SSH Configuration
TEST_SSH_HOST=127.0.0.1          # Default: 127.0.0.1
TEST_SSH_PORT=22                  # Default: 22
TEST_SSH_USERNAME=zyc             # Default: zyc

# Remote Paths
TEST_REMOTE_BASE=/home/zyc/test  # Default: /home/zyc/test
TEST_REMOTE_DIR=/home/zyc/test/sync-test

# Local Paths
TEST_LOCAL_BASE=D:\temp\remote_bak_test\ut
TEST_LOCAL_DIR=D:\temp\remote_bak_test\ut\sync-test

# Performance Test Settings
TEST_FILE_COUNT=10000             # Default: 10000
TEST_MAX_FILE_SIZE_KB=100         # Default: 100
```

## Running Tests

### WSL Tests (No SSH Required)

```bash
# Standalone WSL tests
node test-wsl-standalone.js

# Core WSL functionality tests
npx ts-node test-wsl-core.ts
```

### SSH Tests (Requires Password)

```bash
# Set password and run tests
TEST_SSH_PASSWORD=yourpassword npm test

# Or export it first
export TEST_SSH_PASSWORD=yourpassword
npm test
```

### All Tests

```bash
# Run all tests with SSH password
TEST_SSH_PASSWORD=yourpassword npm test
```

## Test Suites

### 1. WSL Standalone Tests
- **File:** `test-wsl-standalone.js`
- **Requirements:** WSL2 with Ubuntu running
- **No SSH required**
- **Tests:** 6 tests covering basic WSL functionality

### 2. WSL Core Tests
- **File:** `test-wsl-core.ts`
- **Requirements:** WSL2 with Ubuntu running
- **No SSH required**
- **Tests:** 9 tests covering WSLFileAccessor

### 3. SSH Integration Tests
- **File:** `src/test/*.test.ts`
- **Requirements:** SSH server running, password required
- **Tests:** FileSyncEngine, integration, e2e, performance tests

## Quick Test Commands

```bash
# Test only WSL (no password needed)
npm run test:wsl

# Test with SSH (password required)
TEST_SSH_PASSWORD=yourpassword npm test

# Compile TypeScript
npm run compile

# Build extension
npm run package
```

## Security Notes

- Never commit passwords to the repository
- Use environment variables for all sensitive data
- The `.env` file (if used) should be in `.gitignore`
- CI/CD should use secret management for TEST_SSH_PASSWORD
