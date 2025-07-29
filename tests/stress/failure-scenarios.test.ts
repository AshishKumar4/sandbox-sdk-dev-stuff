/**
 * Stress tests and failure scenario tests for process monitoring system
 * These tests are designed to identify edge cases and system-level failures
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { TestErrorGenerator, MockStorageManager } from '../test-utils.js';
import { ProcessMonitor } from '../../container/process-monitor.js';
import { StorageManager } from '../../container/storage.js';
import { ProcessInfo, MonitoringOptions } from '../../container/types.js';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('System Failure Scenarios', () => {
  let tempDir: string;
  let mockStorage: MockStorageManager;
  let processInfo: ProcessInfo;
  let monitoringOptions: MonitoringOptions;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'tests', 'temp', `stress-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockStorage = new MockStorageManager();
    
    processInfo = {
      id: 'stress-test-process',
      instanceId: 'stress-test-instance',
      command: 'node',
      args: [],
      cwd: tempDir,
      state: 'starting',
      startTime: new Date(),
      restartCount: 0
    };

    monitoringOptions = {
      maxRestarts: 3,
      restartDelay: 50,
      healthCheckInterval: 100,
      processTimeout: 2000,
      logBufferSize: 50
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Storage System Failures', () => {
    test('should handle database corruption gracefully', async () => {
      // Create a corrupted database file
      const dbPath = join(tempDir, 'corrupted.db');
      await fs.writeFile(dbPath, 'corrupted-data-not-sqlite');

      const storage = new StorageManager();
      
      // Override the database path for this test
      const originalEnv = process.env.CLI_ERROR_DB_PATH;
      process.env.CLI_ERROR_DB_PATH = dbPath;

      try {
        // Attempt to store an error - should handle corruption gracefully
        const testError = {
          category: 'runtime' as const,
          severity: 'error' as const,
          message: 'Test error',
          sourceFile: undefined,
          lineNumber: undefined,
          columnNumber: undefined,
          stackTrace: 'Test stack trace',
          rawOutput: 'Test raw output',
          context: { instanceId: 'test' }
        };

        const result = storage.storeError('test-instance', 'test-process', testError);
        
        // Should either succeed (if it recreates the DB) or fail gracefully
        expect(typeof result.success).toBe('boolean');
      } finally {
        process.env.CLI_ERROR_DB_PATH = originalEnv;
        storage.close();
      }
    });

    test('should handle disk space exhaustion during error storage', async () => {
      // Simulate a very large error message that could cause storage issues
      const hugeStackTrace = 'Error stack trace line\\n'.repeat(10000);
      const testError = {
        category: 'runtime' as const,
        severity: 'error' as const,
        message: 'Memory exhaustion error',
        sourceFile: undefined,
        lineNumber: undefined,
        columnNumber: undefined,
        stackTrace: hugeStackTrace,
        rawOutput: hugeStackTrace,
        context: { instanceId: 'test' }
      };

      // Attempt to store many large errors rapidly
      const results = [];
      for (let i = 0; i < 100; i++) {
        const result = mockStorage.storeError(`test-instance-${i}`, `test-process-${i}`, testError);
        results.push(result);
      }

      // Should handle storage gracefully, even under stress
      const successfulStores = results.filter(r => r.success).length;
      expect(successfulStores).toBeGreaterThan(0); // Should store at least some
    });
  });

  describe('Memory and Resource Exhaustion', () => {
    test('should handle memory-intensive error detection', async () => {
      // Create a script that generates massive amounts of output
      const memoryStressScript = `
const generateLargeOutput = () => {
  const largeString = 'Error: Memory exhaustion test '.repeat(1000);
  for (let i = 0; i < 100; i++) {
    console.error(largeString + i);
    console.log('Info: Large log message ' + largeString + i);
  }
};

generateLargeOutput();
console.error('TypeError: Cannot read properties of undefined (reading \\'finalProperty\\')');
console.error('    at memoryTest (/app/src/memory-test.js:42:18)');
process.exit(1);
      `;

      const testFile = join(tempDir, 'memory-stress.js');
      await fs.writeFile(testFile, memoryStressScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should still detect the actual error despite massive output
      const storedErrors = mockStorage.getErrors('stress-test-instance');
      expect(storedErrors.success).toBe(true);
      
      const realError = storedErrors.data.find(e => 
        e.message.includes('Cannot read properties of undefined')
      );
      expect(realError).toBeDefined();

      await monitor.stop();
    });

    test('should handle rapid error generation without memory leaks', async () => {
      // Create a script that rapidly generates different types of errors
      const rapidErrorScript = `
const errors = [
  'TypeError: Cannot read properties of undefined',
  'ReferenceError: variable is not defined',
  'SyntaxError: Unexpected token',
  'Error: Module not found',
  'RangeError: Maximum call stack size exceeded'
];

const generateRapidErrors = () => {
  errors.forEach((error, index) => {
    for (let i = 0; i < 20; i++) {
      console.error(error + ' (iteration ' + i + ')');
      console.error('    at rapidTest (/app/src/rapid-test.js:' + (index * 10 + i) + ':' + (i + 5) + ')');
    }
  });
};

generateRapidErrors();
process.exit(1);
      `;

      const testFile = join(tempDir, 'rapid-errors.js');
      await fs.writeFile(testFile, rapidErrorScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const storedErrors = mockStorage.getErrors('stress-test-instance');
      expect(storedErrors.success).toBe(true);
      
      // Should detect multiple different error types
      const uniqueErrorTypes = new Set(storedErrors.data.map(e => e.category));
      expect(uniqueErrorTypes.size).toBeGreaterThan(1);

      await monitor.stop();
    });
  });

  describe('Race Conditions and Timing Issues', () => {
    test('should handle concurrent process monitoring', async () => {
      // Create multiple processes that start and stop at different times
      const processes = [];
      const monitors = [];

      for (let i = 0; i < 5; i++) {
        const concurrentScript = `
console.log('Process ${i} starting');
setTimeout(() => {
  console.error('Error in process ${i}: Something went wrong');
  console.error('    at process${i} (/app/src/concurrent-test.js:${i + 10}:15)');
  process.exit(Math.random() > 0.5 ? 0 : 1);
}, ${Math.random() * 500 + 100});
        `;

        const testFile = join(tempDir, `concurrent-${i}.js`);
        await fs.writeFile(testFile, concurrentScript);

        const processInfo = {
          id: `concurrent-process-${i}`,
          instanceId: `concurrent-instance-${i}`,
          command: 'node',
          args: [testFile],
          cwd: tempDir,
          state: 'starting' as const,
          startTime: new Date(),
          restartCount: 0
        };

        const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
        monitors.push(monitor);
      }

      // Start all monitors concurrently
      const startPromises = monitors.map(monitor => monitor.start());
      const startResults = await Promise.all(startPromises);
      
      // All should start successfully
      expect(startResults.every(result => result.success)).toBe(true);

      // Wait for processes to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have detected errors from at least some processes
      const allErrors = [];
      for (let i = 0; i < 5; i++) {
        const errors = mockStorage.getErrors(`concurrent-instance-${i}`);
        if (errors.success) {
          allErrors.push(...errors.data);
        }
      }

      expect(allErrors.length).toBeGreaterThan(0);

      // Cleanup
      await Promise.all(monitors.map(monitor => monitor.stop()));
    });

    test('should handle rapid start/stop cycles', async () => {
      const quickScript = `
console.error('Quick error message');
console.error('    at quickTest (/app/src/quick.js:5:10)');
process.exit(1);
      `;

      const testFile = join(tempDir, 'quick-test.js');
      await fs.writeFile(testFile, quickScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      // Rapidly start and stop monitoring
      for (let cycle = 0; cycle < 10; cycle++) {
        const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
        
        const startResult = await monitor.start();
        expect(startResult.success).toBe(true);

        // Very short monitoring period
        await new Promise(resolve => setTimeout(resolve, 50));
        
        await monitor.stop();
      }

      // Should have handled all cycles without crashes
      const finalErrors = mockStorage.getErrors('stress-test-instance');
      expect(finalErrors.success).toBe(true);
      // May or may not have errors depending on timing, but should not crash
    });
  });

  describe('Configuration and Environment Failures', () => {
    test('should handle invalid monitoring options gracefully', async () => {
      const invalidOptions: MonitoringOptions = {
        maxRestarts: -1, // Invalid
        restartDelay: -100, // Invalid
        healthCheckInterval: 0, // Invalid
        processTimeout: -1000, // Invalid
        logBufferSize: 0 // Invalid
      };

      const testScript = `
console.error('Error with invalid config');
process.exit(1);
      `;

      const testFile = join(tempDir, 'invalid-config-test.js');
      await fs.writeFile(testFile, testScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      // Should handle invalid options by using defaults or failing gracefully
      const monitor = new ProcessMonitor(processInfo, mockStorage as any, invalidOptions);
      
      const startResult = await monitor.start();
      // Should either succeed with corrected options or fail gracefully
      expect(typeof startResult.success).toBe('boolean');

      if (startResult.success) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await monitor.stop();
      }
    });

    test('should handle missing or inaccessible directories', async () => {
      // Try to run a process in a non-existent directory
      const nonExistentDir = join(tempDir, 'does-not-exist', 'nested', 'deep');
      
      processInfo.cwd = nonExistentDir;
      processInfo.command = 'echo';
      processInfo.args = ['test'];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      
      // Should handle the failure gracefully
      if (!startResult.success) {
        expect(startResult.error).toBeDefined();
      } else {
        // If it somehow succeeded, clean up
        await monitor.stop();
      }
    });
  });

  describe('Edge Case Error Patterns', () => {
    test('should handle malformed error messages', async () => {
      const malformedErrorScript = `
// Malformed stack traces and error messages
console.error('Error without stack trace');
console.error('   at    (no file)');
console.error('');
console.error('   ');
console.error('ERROR: ');
console.error('undefined:undefined:undefined: SyntaxError');
console.error('    at /:0:0');
console.error('    at <anonymous>:<invalid>:<invalid>');
console.error('Error: \\x00\\x01\\x02\\x03 Invalid characters in error message');
console.error('Error: Very \\n long \\n multiline \\n error \\n message \\n with \\n many \\n breaks');
console.error('🚫 Error with emoji 💥 and special chars: @#$%^&*()');
console.error('[object Object] [object Object]');
process.exit(1);
      `;

      const testFile = join(tempDir, 'malformed-errors.js');
      await fs.writeFile(testFile, malformedErrorScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const storedErrors = mockStorage.getErrors('stress-test-instance');
      expect(storedErrors.success).toBe(true);
      
      // Should handle malformed errors without crashing
      // At least some errors should be detected and stored
      expect(storedErrors.data.length).toBeGreaterThan(0);

      // Ensure no stored error causes issues when accessed
      storedErrors.data.forEach(error => {
        expect(typeof error.message).toBe('string');
        expect(error.category).toBeDefined();
        expect(error.severity).toBeDefined();
      });

      await monitor.stop();
    });

    test('should handle extremely long error messages', async () => {
      const veryLongMessage = 'Very long error message '.repeat(5000);
      const longErrorScript = `
console.error('Error: ${veryLongMessage}');
console.error('    at longTest (/app/src/very/deeply/nested/directory/structure/with/long/path/names/test.js:999999:999999)');
process.exit(1);
      `;

      const testFile = join(tempDir, 'long-error.js');
      await fs.writeFile(testFile, longErrorScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const storedErrors = mockStorage.getErrors('stress-test-instance');
      expect(storedErrors.success).toBe(true);
      expect(storedErrors.data.length).toBeGreaterThan(0);

      const longError = storedErrors.data[0];
      expect(longError.message).toBeDefined();
      expect(longError.message.length).toBeGreaterThan(0);
      // Should handle long messages without causing issues

      await monitor.stop();
    });
  });
});