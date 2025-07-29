/**
 * Unit tests for CLI tools functionality
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { TestErrorGenerator, MockStorageManager } from '../test-utils.js';
import { StoredError, ProcessLog } from '../../container/types.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('CLI Tools Tests', () => {
  let tempDir: string;
  let testInstanceId: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'tests', 'temp', `cli-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    testInstanceId = `test-instance-${Date.now()}`;
    
    // Set test environment variables
    process.env.CLI_DATA_DIR = tempDir;
    process.env.CLI_ERROR_DB_PATH = join(tempDir, 'test-errors.db');
    process.env.CLI_LOG_DB_PATH = join(tempDir, 'test-logs.db');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Reset environment variables
    delete process.env.CLI_DATA_DIR;
    delete process.env.CLI_ERROR_DB_PATH;
    delete process.env.CLI_LOG_DB_PATH;
  });

  describe('Error Management Commands', () => {
    test('should list errors with proper formatting', async () => {
      // First, populate some test errors using the storage directly
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testErrors = TestErrorGenerator.generateReactErrors().slice(0, 2);
      
      for (const testError of testErrors) {
        const parsedError = {
          category: testError.category,
          severity: testError.severity,
          message: testError.expectedMessage || testError.rawOutput.split('\n')[0],
          sourceFile: testError.expectedSourceFile,
          lineNumber: testError.expectedLineNumber,
          columnNumber: undefined,
          stackTrace: testError.rawOutput,
          rawOutput: testError.rawOutput,
          context: {}
        };
        
        storage.storeError(testInstanceId, 'test-process', parsedError);
      }

      // Test CLI error list command
      const result = await runCliCommand([
        'errors', 'list', 
        '-i', testInstanceId,
        '--format', 'json'
      ]);

      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.errors).toBeDefined();
      expect(output.errors.length).toBe(2);
      expect(output.summary).toBeDefined();
      expect(output.summary.totalErrors).toBe(2);

      storage.close();
    });

    test('should filter errors by category and severity', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      // Add errors with different categories and severities
      const testErrors = [
        ...TestErrorGenerator.generateReactErrors().slice(0, 2),
        ...TestErrorGenerator.generateTypeScriptErrors().slice(0, 2)
      ];
      
      for (const testError of testErrors) {
        const parsedError = {
          category: testError.category,
          severity: testError.severity,
          message: testError.expectedMessage || testError.rawOutput.split('\n')[0],
          sourceFile: testError.expectedSourceFile,
          lineNumber: testError.expectedLineNumber,
          columnNumber: undefined,
          stackTrace: testError.rawOutput,
          rawOutput: testError.rawOutput,
          context: {}
        };
        
        storage.storeError(testInstanceId, 'test-process', parsedError);
      }

      // Filter by runtime category
      const runtimeResult = await runCliCommand([
        'errors', 'list',
        '-i', testInstanceId,
        '--categories', 'runtime',
        '--format', 'json'
      ]);

      expect(runtimeResult.exitCode).toBe(0);
      const runtimeOutput = JSON.parse(runtimeResult.stdout);
      expect(runtimeOutput.success).toBe(true);
      
      // All returned errors should be runtime category
      runtimeOutput.errors.forEach((error: StoredError) => {
        expect(error.category).toBe('runtime');
      });

      // Filter by error severity
      const errorResult = await runCliCommand([
        'errors', 'list',
        '-i', testInstanceId,
        '--severities', 'error',
        '--format', 'json'
      ]);

      expect(errorResult.exitCode).toBe(0);
      const errorOutput = JSON.parse(errorResult.stdout);
      expect(errorOutput.success).toBe(true);
      
      errorOutput.errors.forEach((error: StoredError) => {
        expect(error.severity).toBe('error');
      });

      storage.close();
    });

    test('should get error statistics', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testErrors = TestErrorGenerator.generateReactErrors().slice(0, 3);
      
      for (const testError of testErrors) {
        const parsedError = {
          category: testError.category,
          severity: testError.severity,
          message: testError.expectedMessage || testError.rawOutput.split('\n')[0],
          sourceFile: testError.expectedSourceFile,
          lineNumber: testError.expectedLineNumber,
          columnNumber: undefined,
          stackTrace: testError.rawOutput,
          rawOutput: testError.rawOutput,
          context: {}
        };
        
        storage.storeError(testInstanceId, 'test-process', parsedError);
      }

      const result = await runCliCommand([
        'errors', 'stats',
        '-i', testInstanceId
      ]);

      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.totalErrors).toBeGreaterThan(0);
      expect(output.errorsByCategory).toBeDefined();
      expect(output.errorsBySeverity).toBeDefined();

      storage.close();
    });

    test('should clear errors with confirmation', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testError = TestErrorGenerator.generateReactErrors()[0];
      const parsedError = {
        category: testError.category,
        severity: testError.severity,
        message: testError.expectedMessage || testError.rawOutput.split('\n')[0],
        sourceFile: testError.expectedSourceFile,
        lineNumber: testError.expectedLineNumber,
        columnNumber: undefined,
        stackTrace: testError.rawOutput,
        rawOutput: testError.rawOutput,
        context: {}
      };
      
      storage.storeError(testInstanceId, 'test-process', parsedError);

      // Clear with confirmation
      const clearResult = await runCliCommand([
        'errors', 'clear',
        '-i', testInstanceId,
        '--confirm'
      ]);

      expect(clearResult.exitCode).toBe(0);
      
      const clearOutput = JSON.parse(clearResult.stdout);
      expect(clearOutput.success).toBe(true);
      expect(clearOutput.clearedCount).toBe(1);

      // Verify errors are cleared
      const listResult = await runCliCommand([
        'errors', 'list',
        '-i', testInstanceId,
        '--format', 'json'
      ]);

      const listOutput = JSON.parse(listResult.stdout);
      expect(listOutput.errors.length).toBe(0);

      storage.close();
    });

    test('should require confirmation flag for clearing', async () => {
      const result = await runCliCommand([
        'errors', 'clear',
        '-i', testInstanceId
      ]);

      expect(result.exitCode).toBe(1);
      
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('--confirm flag required');
    });
  });

  describe('Log Management Commands', () => {
    test('should list logs with proper formatting', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      // Store some test logs
      const testLogs = [
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'info' as const,
          message: 'Application started successfully',
          stream: 'stdout' as const,
          source: 'main.ts'
        },
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'error' as const,
          message: 'Database connection failed',
          stream: 'stderr' as const,
          source: 'database.ts'
        }
      ];

      for (const log of testLogs) {
        storage.storeLog(log);
      }

      const result = await runCliCommand([
        'logs', 'list',
        '-i', testInstanceId,
        '--format', 'json'
      ]);

      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.logs).toBeDefined();
      expect(output.logs.length).toBe(2);

      storage.close();
    });

    test('should filter logs by level and stream', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testLogs = [
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'info' as const,
          message: 'Info message',
          stream: 'stdout' as const
        },
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'error' as const,
          message: 'Error message',
          stream: 'stderr' as const
        },
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'warn' as const,
          message: 'Warning message',
          stream: 'stderr' as const
        }
      ];

      for (const log of testLogs) {
        storage.storeLog(log);
      }

      // Filter by error level
      const errorResult = await runCliCommand([
        'logs', 'list',
        '-i', testInstanceId,
        '--levels', 'error',
        '--format', 'json'
      ]);

      expect(errorResult.exitCode).toBe(0);
      const errorOutput = JSON.parse(errorResult.stdout);
      expect(errorOutput.logs.every((log: ProcessLog) => log.level === 'error')).toBe(true);

      // Filter by stderr stream
      const stderrResult = await runCliCommand([
        'logs', 'list',
        '-i', testInstanceId,
        '--streams', 'stderr',
        '--format', 'json'
      ]);

      expect(stderrResult.exitCode).toBe(0);
      const stderrOutput = JSON.parse(stderrResult.stdout);
      expect(stderrOutput.logs.every((log: ProcessLog) => log.stream === 'stderr')).toBe(true);

      storage.close();
    });

    test('should get logs with reset functionality', async () => {
      // Create a test log file
      const logFilePath = join(tempDir, `${testInstanceId}-process.log`);
      const testLogContent = `[2024-01-01T12:00:00Z] [stdout] Application started
[2024-01-01T12:00:01Z] [stderr] Warning: Deprecated API usage
[2024-01-01T12:00:02Z] [stdout] Server listening on port 3000`;

      await fs.writeFile(logFilePath, testLogContent);

      // Get logs without reset
      const getResult = await runCliCommand([
        'logs', 'get',
        '-i', testInstanceId,
        '--format', 'raw'
      ]);

      expect(getResult.exitCode).toBe(0);
      expect(getResult.stdout).toBe(testLogContent);

      // Verify log file still exists and has content
      const contentAfterGet = await fs.readFile(logFilePath, 'utf8');
      expect(contentAfterGet).toBe(testLogContent);

      // Get logs with reset
      const resetResult = await runCliCommand([
        'logs', 'get',
        '-i', testInstanceId,
        '--format', 'raw',
        '--reset'
      ]);

      expect(resetResult.exitCode).toBe(0);
      expect(resetResult.stdout).toBe(testLogContent);

      // Verify log file is now empty
      const contentAfterReset = await fs.readFile(logFilePath, 'utf8');
      expect(contentAfterReset).toBe('');
    });

    test('should get log statistics', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testLogs = [
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'info' as const,
          message: 'Info 1',
          stream: 'stdout' as const
        },
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'info' as const,
          message: 'Info 2',
          stream: 'stdout' as const
        },
        {
          instanceId: testInstanceId,
          processId: 'test-process',
          level: 'error' as const,
          message: 'Error 1',
          stream: 'stderr' as const
        }
      ];

      for (const log of testLogs) {
        storage.storeLog(log);
      }

      const result = await runCliCommand([
        'logs', 'stats',
        '-i', testInstanceId
      ]);

      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.totalLogs).toBe(3);
      expect(output.logsByLevel).toBeDefined();
      expect(output.logsByLevel.info).toBe(2);
      expect(output.logsByLevel.error).toBe(1);
      expect(output.logsByStream).toBeDefined();
      expect(output.logsByStream.stdout).toBe(2);
      expect(output.logsByStream.stderr).toBe(1);

      storage.close();
    });

    test('should clear logs with confirmation', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testLog = {
        instanceId: testInstanceId,
        processId: 'test-process',
        level: 'info' as const,
        message: 'Test log',
        stream: 'stdout' as const
      };
      
      storage.storeLog(testLog);

      const clearResult = await runCliCommand([
        'logs', 'clear',
        '-i', testInstanceId,
        '--confirm'
      ]);

      expect(clearResult.exitCode).toBe(0);
      
      const clearOutput = JSON.parse(clearResult.stdout);
      expect(clearOutput.success).toBe(true);
      expect(clearOutput.clearedCount).toBe(1);

      storage.close();
    });
  });

  describe('Process Management Commands', () => {
    test('should show help when no command provided', async () => {
      const result = await runCliCommand(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Unified Process Monitoring CLI');
      expect(result.stdout).toContain('process');
      expect(result.stdout).toContain('errors');
      expect(result.stdout).toContain('logs');
    });

    test('should validate required parameters', async () => {
      // Test missing instance ID for error list
      const errorResult = await runCliCommand([
        'errors', 'list'
      ]);

      expect(errorResult.exitCode).toBe(1);
      const errorOutput = JSON.parse(errorResult.stdout);
      expect(errorOutput.success).toBe(false);
      expect(errorOutput.error).toContain('--instance-id is required');

      // Test missing instance ID for log list
      const logResult = await runCliCommand([
        'logs', 'list'
      ]);

      expect(logResult.exitCode).toBe(1);
      const logOutput = JSON.parse(logResult.stdout);
      expect(logOutput.success).toBe(false);
      expect(logOutput.error).toContain('--instance-id is required');
    });

    test('should handle unknown commands gracefully', async () => {
      const result = await runCliCommand(['unknown-command']);
      
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('Unknown command');
    });

    test('should handle unknown subcommands gracefully', async () => {
      const result = await runCliCommand(['errors', 'unknown-subcommand']);
      
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('Unknown error subcommand');
    });
  });

  describe('Output Formatting', () => {
    test('should support different output formats', async () => {
      const { StorageManager } = await import('../../container/storage.js');
      const storage = new StorageManager();
      
      const testError = TestErrorGenerator.generateReactErrors()[0];
      const parsedError = {
        category: testError.category,
        severity: testError.severity,
        message: testError.expectedMessage || testError.rawOutput.split('\n')[0],
        sourceFile: testError.expectedSourceFile,
        lineNumber: testError.expectedLineNumber,
        columnNumber: undefined,
        stackTrace: testError.rawOutput,
        rawOutput: testError.rawOutput,
        context: {}
      };
      
      storage.storeError(testInstanceId, 'test-process', parsedError);

      // Test JSON format
      const jsonResult = await runCliCommand([
        'errors', 'list',
        '-i', testInstanceId,
        '--format', 'json'
      ]);

      expect(jsonResult.exitCode).toBe(0);
      expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();

      // Test table format
      const tableResult = await runCliCommand([
        'errors', 'list',
        '-i', testInstanceId,
        '--format', 'table'
      ]);

      expect(tableResult.exitCode).toBe(0);
      expect(tableResult.stdout).toContain('Timestamp');
      expect(tableResult.stdout).toContain('Severity');
      expect(tableResult.stdout).toContain('Category');

      storage.close();
    });
  });
});

/**
 * Helper function to run CLI commands
 */
async function runCliCommand(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', [
      'run',
      join(process.cwd(), 'container', 'cli-tools.ts'),
      ...args
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message
      });
    });
  });
}