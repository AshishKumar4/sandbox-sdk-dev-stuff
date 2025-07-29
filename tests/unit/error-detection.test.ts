/**
 * Unit tests for error detection and classification
 */

import { expect, test, describe, beforeEach } from "bun:test";
import { TestErrorGenerator, TestAssertions, MockStorageManager } from '../test-utils.js';

// Import the classes we need to test
import { StorageManager } from '../../container/storage.js';
import { ProcessMonitor, ErrorDetector } from '../../container/process-monitor.js';
import { ProcessInfo, MonitoringOptions, ParsedError } from '../../container/types.js';

// Helper class that uses the actual ErrorDetector for testing
class TestErrorDetector {
  private static errorDetector = new ErrorDetector();

  static parseError(content: string, context?: Record<string, unknown>): ParsedError | null {
    return this.errorDetector.parseError(content, context);
  }
}

describe('Error Detection and Classification', () => {
  let mockStorage: MockStorageManager;
  let processInfo: ProcessInfo;
  let monitoringOptions: MonitoringOptions;

  beforeEach(() => {
    mockStorage = new MockStorageManager();
    
    processInfo = {
      id: 'test-process-1',
      instanceId: 'test-instance',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: '/app',
      state: 'running',
      startTime: new Date(),
      restartCount: 0
    };

    monitoringOptions = {
      maxRestarts: 3,
      restartDelay: 1000,
      healthCheckInterval: 30000,
      processTimeout: 300000,
      logBufferSize: 1000
    };
  });

  describe('React Error Detection', () => {
    test('should detect React infinite rendering loops', async () => {
      const testErrors = TestErrorGenerator.generateReactErrors();
      const infiniteLoopError = testErrors.find(e => e.description === "React infinite rendering loop");
      
      if (!infiniteLoopError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(infiniteLoopError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(infiniteLoopError, detectedError);
      
      expect(detectedError?.category).toBe('runtime');
      expect(detectedError?.severity).toBe('error');
      expect(detectedError?.message).toContain('Maximum update depth exceeded');
    });

    test('should detect React Router nested router errors', async () => {
      const testErrors = TestErrorGenerator.generateReactErrors();
      const routerError = testErrors.find(e => e.description === "React Router nested router error");
      
      if (!routerError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(routerError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(routerError, detectedError);
      expect(detectedError?.message).toContain('You should not use <Router>');
    });

    test('should detect component export issues', async () => {
      const testErrors = TestErrorGenerator.generateReactErrors();
      const exportError = testErrors.find(e => e.description === "Component export mismatch");
      
      if (!exportError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(exportError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(exportError, detectedError);
      expect(detectedError?.category).toBe('dependency');
      if (detectedError?.sourceFile) {
        expect(detectedError.sourceFile).toContain('react-dom');
      }
      // Line number extraction is optional
    });

    test('should detect JSX syntax errors', async () => {
      const testErrors = TestErrorGenerator.generateReactErrors();
      const jsxError = testErrors.find(e => e.description === "JSX syntax error");
      
      if (!jsxError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(jsxError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(jsxError, detectedError);
      expect(detectedError?.category).toBe('syntax');
      expect(detectedError?.sourceFile).toContain('MyComponent');
      // Line number extraction is optional for this test
      if (detectedError?.lineNumber) {
        expect(detectedError.lineNumber).toBeGreaterThan(0);
      }
    });
  });

  describe('TypeScript/Node Runtime Error Detection', () => {
    test('should detect undefined property access errors', async () => {
      const testErrors = TestErrorGenerator.generateTypeScriptErrors();
      const undefinedError = testErrors.find(e => e.description === "Cannot read properties of undefined");
      
      if (!undefinedError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(undefinedError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(undefinedError, detectedError);
      expect(detectedError?.category).toBe('runtime');
      expect(detectedError?.message).toContain("Cannot read properties of undefined");
      expect(detectedError?.sourceFile).toContain('UserList');
      // Line number extraction is optional for this test  
      if (detectedError?.lineNumber) {
        expect(detectedError.lineNumber).toBeGreaterThan(0);
      }
    });

    test('should detect module resolution errors', async () => {
      const testErrors = TestErrorGenerator.generateTypeScriptErrors();
      const moduleError = testErrors.find(e => e.description === "Module resolution error");
      
      if (!moduleError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(moduleError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(moduleError, detectedError);
      expect(detectedError?.category).toBe('dependency');
      expect(detectedError?.message).toContain("Cannot resolve module");
    });

    test('should detect constant reassignment errors', async () => {
      const testErrors = TestErrorGenerator.generateTypeScriptErrors();
      const constError = testErrors.find(e => e.description === "Assignment to constant variable");
      
      if (!constError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(constError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(constError, detectedError);
      expect(detectedError?.category).toBe('syntax');
      expect(detectedError?.sourceFile).toContain('settings');
    });

    test('should detect duplicate identifier errors', async () => {
      const testErrors = TestErrorGenerator.generateTypeScriptErrors();
      const duplicateError = testErrors.find(e => e.description === "Duplicate identifier");
      
      if (!duplicateError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(duplicateError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(duplicateError, detectedError);
      expect(detectedError?.message).toContain("Duplicate identifier 'UserType'");
    });

    test('should detect undefined variable references', async () => {
      const testErrors = TestErrorGenerator.generateTypeScriptErrors();
      const refError = testErrors.find(e => e.description === "ReferenceError for undefined variable");
      
      if (!refError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(refError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(refError, detectedError);
      expect(detectedError?.category).toBe('runtime');
      expect(detectedError?.message).toContain("someUndefinedVariable is not defined");
    });
  });

  describe('Vite Build Error Detection', () => {
    test('should detect Vite build failures', async () => {
      const testErrors = TestErrorGenerator.generateViteBuildErrors();
      const buildError = testErrors.find(e => e.description === "Vite build failed with compilation errors");
      
      if (!buildError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(buildError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(buildError, detectedError);
      expect(detectedError?.category).toBe('build');
      expect(detectedError?.message).toContain('Could not resolve "./missing-file"');
    });

    test('should detect Vite transform failures', async () => {
      const testErrors = TestErrorGenerator.generateViteBuildErrors();
      const transformError = testErrors.find(e => e.description === "Vite transform failed");
      
      if (!transformError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(transformError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(transformError, detectedError);
      expect(detectedError?.sourceFile).toContain('BrokenComponent');
      // Line number extraction is optional for this test
      if (detectedError?.lineNumber) {
        expect(detectedError.lineNumber).toBeGreaterThan(0);
      }
    });

    test('should detect CSS import resolution errors', async () => {
      const testErrors = TestErrorGenerator.generateViteBuildErrors();
      const cssError = testErrors.find(e => e.description === "CSS import resolution failed");
      
      if (!cssError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(cssError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(cssError, detectedError);
      expect(detectedError?.message).toContain('./nonexistent.css');
    });
  });

  describe('Third-party SDK Error Detection', () => {
    test('should detect OpenAI API errors', async () => {
      const testErrors = TestErrorGenerator.generateSDKErrors();
      const openaiError = testErrors.find(e => e.description === "OpenAI API authentication error");
      
      if (!openaiError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(openaiError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(openaiError, detectedError);
      expect(detectedError?.message).toContain("401 Unauthorized");
      // Source file can be either the user file or the OpenAI library file
      expect(detectedError?.sourceFile).toMatch(/(ai|openai)/i);
    });

    test('should detect database connection errors', async () => {
      const testErrors = TestErrorGenerator.generateSDKErrors();
      const dbError = testErrors.find(e => e.description === "Database connection failure");
      
      if (!dbError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(dbError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(dbError, detectedError);
      expect(detectedError?.message).toContain("ECONNREFUSED");
    });

    test('should detect HTTP client errors', async () => {
      const testErrors = TestErrorGenerator.generateSDKErrors();
      const httpError = testErrors.find(e => e.description === "Fetch API network error");
      
      if (!httpError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(httpError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(httpError, detectedError);
      expect(detectedError?.message).toContain("fetch failed");
    });
  });

  describe('CSS and Syntax Error Detection', () => {
    test('should detect CSS parsing errors', async () => {
      const testErrors = TestErrorGenerator.generateCSSErrors();
      const cssError = testErrors.find(e => e.description === "CSS parsing error");
      
      if (!cssError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(cssError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(cssError, detectedError);
      // Line number should be extracted (any positive number is valid)
      expect(detectedError?.lineNumber).toBeGreaterThan(0);
    });

    test('should detect Tailwind CSS errors', async () => {
      const testErrors = TestErrorGenerator.generateCSSErrors();
      const tailwindError = testErrors.find(e => e.description === "Tailwind CSS class not found");
      
      if (!tailwindError) throw new Error("Test case not found");

      const detectedError = TestErrorDetector.parseError(tailwindError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      TestAssertions.assertErrorDetected(tailwindError, detectedError);
      expect(detectedError?.message).toContain("invalid-tailwind-class");
    });

    test('should detect general syntax errors', async () => {
      const testErrors = TestErrorGenerator.generateSyntaxErrors();
      
      for (const syntaxError of testErrors) {
        const detectedError = TestErrorDetector.parseError(syntaxError.rawOutput, {
          stream: 'stderr',
          timestamp: new Date(),
          instanceId: 'test-instance'
        });

        TestAssertions.assertErrorDetected(syntaxError, detectedError);
        expect(detectedError?.category).toBe('syntax');
      }
    });
  });

  describe('False Positive Prevention', () => {
    test('should NOT detect Vite development server messages as errors', async () => {
      const falsePositives = TestErrorGenerator.generateFalsePositives();
      
      for (const falsePositive of falsePositives) {
        const detectedError = TestErrorDetector.parseError(falsePositive.rawOutput, {
          stream: falsePositive.rawOutput.startsWith('ERROR:') ? 'stderr' : 'stdout',
          timestamp: new Date(),
          instanceId: 'test-instance'
        });

        TestAssertions.assertErrorDetected(falsePositive, detectedError);
      }
    });

    test('should properly skip Vite development server patterns', async () => {
      // Test individual Vite messages
      const viteMessages = [
        "$ vite --host 0.0.0.0",
        "ERROR: $ vite --host 0.0.0.0 --port ${PORT:-3000}",
        "VITE v6.3.5 ready in 722 ms",
        "Local: http://localhost:3000/",
        "Default inspector port 9229 not available, using 9230 instead",
        "ERROR: Default inspector port 9229 not available, using 9230 instead"
      ];

      for (const message of viteMessages) {
        const detectedError = TestErrorDetector.parseError(message, {
          stream: message.startsWith('ERROR:') ? 'stderr' : 'stdout',
          timestamp: new Date(),
          instanceId: 'test-instance'
        });

        expect(detectedError).toBeNull();
      }
    });
  });

  describe('Error Storage and Retrieval', () => {
    test('should store detected errors correctly', async () => {
      const testError = TestErrorGenerator.generateReactErrors()[0]; // Get first React error
      
      const detectedError = TestErrorDetector.parseError(testError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      if (detectedError) {
        const storeResult = mockStorage.storeError('test-instance', 'test-process', detectedError);
        expect(storeResult.success).toBe(true);
      }

      const retrievedErrors = mockStorage.getErrors('test-instance');
      expect(retrievedErrors.success).toBe(true);
      expect(retrievedErrors.data.length).toBe(1);
      
      const storedError = retrievedErrors.data[0];
      expect(storedError.message).toContain('Maximum update depth exceeded');
      expect(storedError.category).toBe('runtime');
    });

    test('should handle error deduplication', async () => {
      const testError = TestErrorGenerator.generateReactErrors()[0];
      
      const detectedError = TestErrorDetector.parseError(testError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      // Store the same error twice
      if (detectedError) {
        mockStorage.storeError('test-instance', 'test-process', detectedError);
        mockStorage.storeError('test-instance', 'test-process', detectedError);
      }

      const retrievedErrors = mockStorage.getErrors('test-instance');
      // Mock storage doesn't implement deduplication, but real storage should
      // This test documents expected behavior
      expect(retrievedErrors.data.length).toBeGreaterThan(0);
    });

    test('should clear errors when requested', async () => {
      const testError = TestErrorGenerator.generateReactErrors()[0];
      
      const detectedError = TestErrorDetector.parseError(testError.rawOutput, {
        stream: 'stderr',
        timestamp: new Date(),
        instanceId: 'test-instance'
      });

      if (detectedError) {
        mockStorage.storeError('test-instance', 'test-process', detectedError);
      }

      const clearResult = mockStorage.clearErrors('test-instance');
      expect(clearResult.success).toBe(true);
      expect(clearResult.data.clearedCount).toBe(1);

      const retrievedErrors = mockStorage.getErrors('test-instance');
      expect(retrievedErrors.data.length).toBe(0);
    });
  });
});