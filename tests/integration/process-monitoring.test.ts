/**
 * Integration tests for the complete process monitoring workflow
 */

import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { TestErrorGenerator, MockStorageManager } from '../test-utils.js';
import { ProcessMonitor } from '../../container/process-monitor.js';
import { ProcessInfo, MonitoringOptions } from '../../container/types.js';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('Process Monitoring Integration Tests', () => {
  let tempDir: string;
  let mockStorage: MockStorageManager;
  let processInfo: ProcessInfo;
  let monitoringOptions: MonitoringOptions;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = join(process.cwd(), 'tests', 'temp', `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockStorage = new MockStorageManager();
    
    processInfo = {
      id: 'integration-test-process',
      instanceId: 'integration-test-instance',
      command: 'node',
      args: [],
      cwd: tempDir,
      state: 'starting',
      startTime: new Date(),
      restartCount: 0
    };

    monitoringOptions = {
      maxRestarts: 2,
      restartDelay: 100, // Fast for testing
      healthCheckInterval: 1000,
      processTimeout: 5000,
      logBufferSize: 100
    };
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Real Process Error Detection', () => {
    test('should detect and store React rendering errors from real process', async () => {
      // Create a test React component with infinite loop
      const testComponent = `
const React = require('react');
const { useState, useEffect } = React;

function InfiniteLoopComponent() {
  const [count, setCount] = useState(0);
  
  // This will cause infinite re-renders
  setCount(count + 1);
  
  return React.createElement('div', null, 'Count: ' + count);
}

// Simulate React rendering
try {
  const component = InfiniteLoopComponent();
  console.log('Component rendered');
} catch (error) {
  console.error('Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.');
  console.error('    at checkForNestedUpdates (/app/node_modules/react-dom/cjs/react-dom.development.js:25463:15)');
  console.error('    at scheduleUpdateOnFiber (/app/node_modules/react-dom/cjs/react-dom.development.js:21840:5)');
  process.exit(1);
}
      `;

      const testFile = join(tempDir, 'infinite-loop-test.js');
      await fs.writeFile(testFile, testComponent);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      // Start monitoring
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      // Wait for process to complete and error to be detected
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if error was stored
      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      expect(storedErrors.data.length).toBeGreaterThan(0);

      const reactError = storedErrors.data.find(e => 
        e.message.includes('Maximum update depth exceeded')
      );
      expect(reactError).toBeDefined();
      expect(reactError?.category).toBe('runtime');

      await monitor.stop();
    });

    test('should detect TypeScript compilation errors from real process', async () => {
      // Create a TypeScript file with errors
      const testTypeScript = `
// This will cause TypeScript errors
interface User {
  name: string;
  age: number;
}

interface User {  // Duplicate interface
  email: string;
}

const user: User = {
  name: "John",
  age: "thirty", // Type mismatch
  invalidProperty: true // Extra property
};

console.log(user.nonExistentProperty.someMethod()); // Undefined property access
      `;

      const testFile = join(tempDir, 'typescript-errors.ts');
      await fs.writeFile(testFile, testTypeScript);

      // Create a script that runs TypeScript compiler and outputs errors
      const compilerScript = `
const { exec } = require('child_process');

exec('npx tsc --noEmit ${testFile}', (error, stdout, stderr) => {
  if (error) {
    console.error('Error: Duplicate identifier \\'User\\'. ');
    console.error('src/types/user.ts(12,13): \\'User\\' was also declared here.');
    console.error('    at checkDuplicateIdentifier (/app/node_modules/typescript/lib/typescript.js:42156:22)');
    
    console.error('TypeError: Cannot read properties of undefined (reading \\'someMethod\\')');
    console.error('    at Object.<anonymous> (/app/test.ts:15:45)');
    
    process.exit(1);
  }
});
      `.replace('${testFile}', testFile);

      const scriptFile = join(tempDir, 'compile-test.js');
      await fs.writeFile(scriptFile, compilerScript);

      processInfo.command = 'node';
      processInfo.args = [scriptFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      expect(storedErrors.data.length).toBeGreaterThan(0);

      // Check for duplicate identifier error
      const duplicateError = storedErrors.data.find(e => 
        e.message.includes('Duplicate identifier')
      );
      expect(duplicateError).toBeDefined();
      expect(duplicateError?.category).toBe('syntax');

      // Check for undefined property error
      const undefinedError = storedErrors.data.find(e => 
        e.message.includes('Cannot read properties of undefined')
      );
      expect(undefinedError).toBeDefined();
      expect(undefinedError?.category).toBe('runtime');

      await monitor.stop();
    });

    test('should detect Node.js module resolution errors', async () => {
      // Create a script that tries to import non-existent modules
      const testScript = `
try {
  require('./nonexistent-module');
} catch (error) {
  console.error('Error: Cannot resolve module \\'./nonexistent-module\\' from \\'/app/src/utils/helper.ts\\'');
  console.error('    at resolveModule (/app/node_modules/vite/dist/node/chunks/dep-df561101.js:44403:21)');
}

try {
  const undefinedVar = someUndefinedVariable;
} catch (error) {
  console.error('ReferenceError: someUndefinedVariable is not defined');
  console.error('    at calculateTotal (/app/src/utils/math.ts:34:12)');
  console.error('    at processOrder (/app/src/services/order.ts:89:25)');
}

// Simulate constant reassignment
try {
  const MY_CONSTANT = "original";
  MY_CONSTANT = "modified"; // This should cause an error
} catch (error) {
  console.error('TypeError: Assignment to constant variable.');
  console.error('    at updateConfig (/app/src/config/settings.ts:15:5)');
  console.error('    at initialize (/app/src/main.ts:23:7)');
}

process.exit(1);
      `;

      const testFile = join(tempDir, 'module-errors.js');
      await fs.writeFile(testFile, testScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      expect(storedErrors.data.length).toBeGreaterThan(0);

      // Check for module resolution error
      const moduleError = storedErrors.data.find(e => 
        e.message.includes('Cannot resolve module')
      );
      expect(moduleError).toBeDefined();
      expect(moduleError?.category).toBe('dependency');

      // Check for undefined variable error
      const referenceError = storedErrors.data.find(e => 
        e.message.includes('someUndefinedVariable is not defined')
      );
      expect(referenceError).toBeDefined();
      expect(referenceError?.category).toBe('runtime');

      // Check for constant reassignment error
      const constError = storedErrors.data.find(e => 
        e.message.includes('Assignment to constant variable')
      );
      expect(constError).toBeDefined();
      expect(constError?.category).toBe('syntax');

      await monitor.stop();
    });

    test('should NOT detect Vite dev server messages as errors', async () => {
      // Create a script that outputs Vite-like development server messages
      const viteSimulator = `
console.error('$ vite --host 0.0.0.0 --port \${PORT:-3000}');
console.error('ERROR: $ vite --host 0.0.0.0 --port \${PORT:-3000}');
console.error('Default inspector port 9229 not available, using 9230 instead');
console.error('ERROR: Default inspector port 9229 not available, using 9230 instead');
console.log('VITE v6.3.5  ready in 722 ms');
console.log('Local:   http://localhost:3000/');
console.log('➜  Local:   http://localhost:3000/');

setTimeout(() => {
  console.log('[vite] hmr update /src/App.tsx');
  console.log('[vite] page reload src/main.tsx (hmr update failed)');
  console.log('ready in 145ms');
}, 100);

setTimeout(() => {
  process.exit(0);
}, 500);
      `;

      const testFile = join(tempDir, 'vite-simulator.js');
      await fs.writeFile(testFile, viteSimulator);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      
      // Should have NO errors detected from Vite messages
      expect(storedErrors.data.length).toBe(0);

      await monitor.stop();
    });
  });

  describe('Process Restart and Recovery', () => {
    test('should restart process when it crashes and detect subsequent errors', async () => {
      // Create a script that crashes on first run, succeeds on restart
      const crashingScript = `
const fs = require('fs');
const path = require('path');

const flagFile = path.join('${tempDir}', 'restart-flag.txt');

try {
  // Check if this is a restart
  const isRestart = fs.existsSync(flagFile);
  
  if (!isRestart) {
    // First run - create flag and crash
    fs.writeFileSync(flagFile, 'restarted');
    console.error('TypeError: Cannot read properties of undefined (reading \\'crashProperty\\')');
    console.error('    at main (/app/src/crash-test.js:15:25)');
    process.exit(1);
  } else {
    // Restart - run successfully
    console.log('Process restarted successfully');
    setTimeout(() => process.exit(0), 200);
  }
} catch (error) {
  console.error('Unexpected error:', error.message);
  process.exit(1);
}
      `;

      const testFile = join(tempDir, 'crash-restart-test.js');
      await fs.writeFile(testFile, crashingScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      // Wait for crash, restart, and completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      
      // Should have detected the crash error
      const crashError = storedErrors.data.find(e => 
        e.message.includes('Cannot read properties of undefined')
      );
      expect(crashError).toBeDefined();
      expect(crashError?.category).toBe('runtime');

      // Check that process was restarted
      const processStats = monitor.getStats();
      expect(processStats.restartCount).toBeGreaterThan(0);

      await monitor.stop();
    });

    test('should stop restarting after max restart limit reached', async () => {
      // Create a script that always crashes
      const alwaysCrashScript = `
console.error('Fatal error: Process always crashes');
console.error('    at main (/app/src/always-crash.js:10:15)');
process.exit(1);
      `;

      const testFile = join(tempDir, 'always-crash.js');
      await fs.writeFile(testFile, alwaysCrashScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      // Set low restart limit for testing
      monitoringOptions.maxRestarts = 1;
      monitoringOptions.restartDelay = 50;

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      // Wait for crashes and restart attempts
      await new Promise(resolve => setTimeout(resolve, 1000));

      const processStats = monitor.getStats();
      expect(processStats.restartCount).toBe(1); // Should have reached max restarts
      expect(processStats.state).toBe('failed'); // Should be failed state

      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      expect(storedErrors.data.length).toBeGreaterThan(0);

      await monitor.stop();
    });
  });

  describe('Log Collection and Processing', () => {
    test('should collect and store logs with proper classification', async () => {
      // Create a script that outputs various log levels
      const logTestScript = `
console.log('info: Application starting up');
console.log('VITE v6.3.5  ready in 722 ms');
console.log('Local:   http://localhost:3000/');

console.error('warning: Deprecated API usage detected');
console.error('ERROR: Failed to compile application'); 

console.log('debug: Processing user request');
console.log('Process completed successfully');

setTimeout(() => process.exit(0), 200);
      `;

      const testFile = join(tempDir, 'log-test.js');
      await fs.writeFile(testFile, logTestScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check stored logs
      const storedLogs = mockStorage.getLogs({ instanceId: 'integration-test-instance' });
      expect(storedLogs.success).toBe(true);
      expect(storedLogs.data.logs.length).toBeGreaterThan(0);

      // Check log classification
      const infoLogs = storedLogs.data.logs.filter(log => log.level === 'info');
      const errorLogs = storedLogs.data.logs.filter(log => log.level === 'error');
      
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(errorLogs.length).toBeGreaterThan(0);

      // Check that Vite messages were classified as info, not error
      const viteLog = storedLogs.data.logs.find(log => 
        log.message.includes('VITE v6.3.5')
      );
      expect(viteLog?.level).toBe('info');

      // Check that real errors were detected
      const storedErrors = mockStorage.getErrors('integration-test-instance');
      expect(storedErrors.success).toBe(true);
      
      const compileError = storedErrors.data.find(e => 
        e.message.includes('Failed to compile application')
      );
      expect(compileError).toBeDefined();

      await monitor.stop();
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle high-frequency log output without memory leaks', async () => {
      // Create a script that outputs many logs quickly
      const highVolumeScript = `
let count = 0;
const interval = setInterval(() => {
  console.log(\`Log message \${count}: Processing item \${count}\`);
  console.error(\`Debug info \${count}: Memory usage check\`);
  
  count++;
  if (count >= 100) {
    clearInterval(interval);
    console.log('High volume test completed');
    process.exit(0);
  }
}, 10);
      `;

      const testFile = join(tempDir, 'high-volume-test.js');
      await fs.writeFile(testFile, highVolumeScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const storedLogs = mockStorage.getLogs({ instanceId: 'integration-test-instance' });
      expect(storedLogs.success).toBe(true);
      
      // Should have collected logs but limited by buffer size
      expect(storedLogs.data.logs.length).toBeGreaterThan(0);
      expect(storedLogs.data.logs.length).toBeLessThanOrEqual(monitoringOptions.logBufferSize);

      await monitor.stop();
    });

    test('should cleanup resources properly on shutdown', async () => {
      const simpleScript = `
console.log('Simple test script running');
setTimeout(() => {
  console.log('Script completed');
  process.exit(0);
}, 500);
      `;

      const testFile = join(tempDir, 'simple-test.js');
      await fs.writeFile(testFile, simpleScript);

      processInfo.command = 'node';
      processInfo.args = [testFile];

      const monitor = new ProcessMonitor(processInfo, mockStorage as any, monitoringOptions);
      
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);

      // Let it run briefly then stop
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const stopResult = await monitor.stop();
      expect(stopResult.success).toBe(true);

      // Verify cleanup
      const processStats = monitor.getStats();
      expect(processStats.state).toBe('stopped');
    });
  });
});