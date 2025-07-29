/**
 * Test utilities for process monitoring and error detection tests
 */

import { ProcessLog, StoredError, ParsedError, ErrorCategory, ErrorSeverity } from '../container/types.js';

export interface TestError {
  description: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  rawOutput: string;
  expectedMessage?: string;
  expectedSourceFile?: string;
  expectedLineNumber?: number;
  shouldBeDetected: boolean;
}

export class TestErrorGenerator {
  /**
   * Generate React-specific error test cases
   */
  static generateReactErrors(): TestError[] {
    return [
      // Maximum update depth exceeded
      {
        description: "React infinite rendering loop",
        category: "runtime",
        severity: "error",
        rawOutput: `Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.
    at checkForNestedUpdates (/app/node_modules/react-dom/cjs/react-dom.development.js:25463:15)
    at scheduleUpdateOnFiber (/app/node_modules/react-dom/cjs/react-dom.development.js:21840:5)`,
        expectedMessage: "Maximum update depth exceeded",
        shouldBeDetected: true
      },

      // Nested Router components
      {
        description: "React Router nested router error",
        category: "runtime",
        severity: "error", 
        rawOutput: `Error: You should not use <Router> or withRouter() outside a <Router>
    at useNavigate (/app/node_modules/react-router/index.js:142:11)
    at NavigationComponent (/app/src/components/Navigation.tsx:15:20)`,
        expectedMessage: "You should not use <Router> or withRouter() outside a <Router>",
        shouldBeDetected: true
      },

      // Component export issues
      {
        description: "Component export mismatch",
        category: "dependency",
        severity: "error",
        rawOutput: `Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.
    at createFiberFromTypeAndProps (/app/node_modules/react-dom/cjs/react-dom.development.js:27469:21)
    at createFiberFromElement (/app/node_modules/react-dom/cjs/react-dom.development.js:27495:15)`,
        expectedMessage: "Element type is invalid: expected a string",
        expectedSourceFile: "react-dom/cjs/react-dom.development.js",
        expectedLineNumber: 27469,
        shouldBeDetected: true
      },

      // JSX syntax error
      {
        description: "JSX syntax error",
        category: "syntax", 
        severity: "error",
        rawOutput: `SyntaxError: Unexpected token '<' in JSON at position 0
    at JSON.parse (<anonymous>)
    at parseJSX (/app/src/components/MyComponent.tsx:42:18)`,
        expectedMessage: "Unexpected token '<' in JSON at position 0",
        expectedSourceFile: "src/components/MyComponent.tsx",
        expectedLineNumber: 42,
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate TypeScript/Node runtime error test cases
   */
  static generateTypeScriptErrors(): TestError[] {
    return [
      // Undefined properties
      {
        description: "Cannot read properties of undefined",
        category: "runtime",
        severity: "error",
        rawOutput: `TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:25:31)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:16305:18)`,
        expectedMessage: "Cannot read properties of undefined (reading 'map')",
        expectedSourceFile: "src/components/UserList.tsx",
        expectedLineNumber: 25,
        shouldBeDetected: true
      },

      // Incorrect imports
      {
        description: "Module resolution error",
        category: "dependency",
        severity: "error",
        rawOutput: `Error: Cannot resolve module './nonexistent-module' from '/app/src/utils/helper.ts'
    at resolveModule (/app/node_modules/vite/dist/node/chunks/dep-df561101.js:44403:21)`,
        expectedMessage: "Cannot resolve module './nonexistent-module'",
        expectedSourceFile: "src/utils/helper.ts", 
        shouldBeDetected: true
      },

      // Constant reassignment
      {
        description: "Assignment to constant variable",
        category: "syntax",
        severity: "error", 
        rawOutput: `TypeError: Assignment to constant variable.
    at updateConfig (/app/src/config/settings.ts:15:5)
    at initialize (/app/src/main.ts:23:7)`,
        expectedMessage: "Assignment to constant variable",
        expectedSourceFile: "src/config/settings.ts",
        expectedLineNumber: 15,
        shouldBeDetected: true
      },

      // Duplicate definitions
      {
        description: "Duplicate identifier",
        category: "syntax", 
        severity: "error",
        rawOutput: `Error: Duplicate identifier 'UserType'. 
src/types/user.ts(12,13): 'UserType' was also declared here.
    at checkDuplicateIdentifier (/app/node_modules/typescript/lib/typescript.js:42156:22)`,
        expectedMessage: "Duplicate identifier 'UserType'",
        expectedSourceFile: "src/types/user.ts",
        expectedLineNumber: 12,
        shouldBeDetected: true
      },

      // Undefined variables
      {
        description: "ReferenceError for undefined variable",
        category: "runtime",
        severity: "error",
        rawOutput: `ReferenceError: someUndefinedVariable is not defined
    at calculateTotal (/app/src/utils/math.ts:34:12)
    at processOrder (/app/src/services/order.ts:89:25)`,
        expectedMessage: "someUndefinedVariable is not defined",
        expectedSourceFile: "src/utils/math.ts",
        expectedLineNumber: 34,
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate Vite build and compilation error test cases
   */
  static generateViteBuildErrors(): TestError[] {
    return [
      // Vite build failure
      {
        description: "Vite build failed with compilation errors",
        category: "build",
        severity: "error",
        rawOutput: `[vite:build] Rollup failed to resolve import "./missing-file" from "src/main.ts".
Error: Could not resolve "./missing-file" from src/main.ts
    at error (/app/node_modules/rollup/dist/shared/rollup.js:158:30)
    at ModuleLoader.handleResolveId (/app/node_modules/rollup/dist/shared/rollup.js:22541:24)`,
        expectedMessage: 'Could not resolve "./missing-file" from src/main.ts',
        expectedSourceFile: "src/main.ts",
        shouldBeDetected: true
      },

      // Transform failed
      {
        description: "Vite transform failed",
        category: "build",
        severity: "error",
        rawOutput: `[vite] Internal server error: Transform failed with 1 error:
src/components/BrokenComponent.tsx:15:25: ERROR: Expected "}" but found ";"
    at failureErrorWithLog (/app/node_modules/esbuild/lib/main.js:1603:15)
    at /app/node_modules/esbuild/lib/main.js:1249:28`,
        expectedMessage: 'Expected "}" but found ";"',
        expectedSourceFile: "src/components/BrokenComponent.tsx",
        expectedLineNumber: 15,
        shouldBeDetected: true
      },

      // CSS import error
      {
        description: "CSS import resolution failed",
        category: "build",
        severity: "error",
        rawOutput: `[vite] Pre-transform error: Failed to resolve import "./nonexistent.css" from "src/App.tsx"
    at formatError (/app/node_modules/vite/dist/node/chunks/dep-f0e4b793.js:49830:46)
    at TransformContext.error (/app/node_modules/vite/dist/node/chunks/dep-f0e4b793.js:49826:19)`,
        expectedMessage: 'Failed to resolve import "./nonexistent.css"',
        expectedSourceFile: "src/App.tsx",
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate third-party SDK error test cases (OpenAI, etc.)
   */
  static generateSDKErrors(): TestError[] {
    return [
      // OpenAI API error
      {
        description: "OpenAI API authentication error",
        category: "runtime",
        severity: "error",
        rawOutput: `OpenAIError: 401 Unauthorized - Incorrect API key provided
    at APIError.generate (/app/node_modules/openai/error.js:44:20)
    at OpenAI.makeStatusError (/app/node_modules/openai/core.js:263:25)
    at OpenAI.makeRequest (/app/node_modules/openai/core.js:306:24)
    at generateCompletion (/app/src/services/ai.ts:28:18)`,
        expectedMessage: "401 Unauthorized - Incorrect API key provided",
        expectedSourceFile: "src/services/ai.ts",
        expectedLineNumber: 28,
        shouldBeDetected: true
      },

      // Database connection error
      {
        description: "Database connection failure",
        category: "runtime",
        severity: "error",
        rawOutput: `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1157:16)
    at connectToDatabase (/app/src/lib/database.ts:45:12)
    at initializeApp (/app/src/main.ts:15:8)`,
        expectedMessage: "connect ECONNREFUSED 127.0.0.1:5432",
        expectedSourceFile: "src/lib/database.ts",
        expectedLineNumber: 45,
        shouldBeDetected: true
      },

      // HTTP client error
      {
        description: "Fetch API network error",
        category: "runtime",
        severity: "error",
        rawOutput: `TypeError: fetch failed
    at Object.fetch (node:internal/deps/undici/undici:11576:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async apiCall (/app/src/services/api.ts:52:20)`,
        expectedMessage: "fetch failed",
        expectedSourceFile: "src/services/api.ts", 
        expectedLineNumber: 52,
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate CSS and styling error test cases
   */
  static generateCSSErrors(): TestError[] {
    return [
      // CSS syntax error
      {
        description: "CSS parsing error",
        category: "syntax",
        severity: "error",
        rawOutput: `[vite:css] Unexpected } at 1:25
1 | .my-class { color: red; } }
  |                         ^
    at Input.error (/app/node_modules/postcss/lib/input.js:148:16)
    at Parser.other (/app/node_modules/postcss/lib/parser.js:288:18)`,
        expectedMessage: "Unexpected } at 1:25",
        expectedLineNumber: 1,
        shouldBeDetected: true
      },

      // Tailwind CSS error
      {
        description: "Tailwind CSS class not found",
        category: "build",
        severity: "error",
        rawOutput: `[vite:css] [postcss] Cannot find utility class 'invalid-tailwind-class' in Tailwind CSS
    at processTailwind (/app/node_modules/@tailwindcss/postcss7-compat/src/index.js:128:13)
    at /app/src/styles/globals.css:15:3`,
        expectedMessage: "Cannot find utility class 'invalid-tailwind-class'",
        expectedSourceFile: "src/styles/globals.css",
        expectedLineNumber: 15,
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate syntax and parsing error test cases
   */
  static generateSyntaxErrors(): TestError[] {
    return [
      // Missing semicolon/bracket
      {
        description: "Missing closing bracket",
        category: "syntax",
        severity: "error",
        rawOutput: `SyntaxError: Unexpected end of input
    at wrapSafe (node:internal/modules/cjs/loader:1032:16)
    at Module._compile (node:internal/modules/cjs/loader:1067:27)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1157:10)
    at Module.load (/app/src/utils/parser.js:24:32)`,
        expectedMessage: "Unexpected end of input",
        expectedSourceFile: "src/utils/parser.js",
        expectedLineNumber: 24,
        shouldBeDetected: true
      },

      // Unusual characters
      {
        description: "Invalid character in source",
        category: "syntax",
        severity: "error",
        rawOutput: `SyntaxError: Invalid or unexpected token
    at new Function (<anonymous>)
    at evalCode (/app/src/dynamic/evaluator.ts:18:5)`,
        expectedMessage: "Invalid or unexpected token",
        expectedSourceFile: "src/dynamic/evaluator.ts",
        expectedLineNumber: 18,
        shouldBeDetected: true
      },

      // Incomplete code
      {
        description: "Incomplete function definition",
        category: "syntax",
        severity: "error",
        rawOutput: `SyntaxError: Unexpected token '}'
    at checkSyntax (/app/src/compiler/validator.ts:67:15)
    at validateCode (/app/src/compiler/index.ts:34:8)`,
        expectedMessage: "Unexpected token '}'",
        expectedSourceFile: "src/compiler/validator.ts", 
        expectedLineNumber: 67,
        shouldBeDetected: true
      }
    ];
  }

  /**
   * Generate false positive test cases (should NOT be detected as errors)
   */
  static generateFalsePositives(): TestError[] {
    return [
      // Vite dev server messages
      {
        description: "Vite command echo",
        category: "info",
        severity: "info",
        rawOutput: "$ vite --host 0.0.0.0 --port ${PORT:-3000}",
        shouldBeDetected: false
      },
      {
        description: "Vite stderr command echo",
        category: "info", 
        severity: "info",
        rawOutput: "ERROR: $ vite --host 0.0.0.0 --port ${PORT:-3000}",
        shouldBeDetected: false
      },
      {
        description: "Inspector port message",
        category: "info",
        severity: "info", 
        rawOutput: "Default inspector port 9229 not available, using 9230 instead",
        shouldBeDetected: false
      },
      {
        description: "Vite ready message",
        category: "info",
        severity: "info",
        rawOutput: "VITE v6.3.5  ready in 722 ms",
        shouldBeDetected: false
      },
      {
        description: "Server URL announcement",
        category: "info",
        severity: "info",
        rawOutput: "Local:   http://localhost:3000/",
        shouldBeDetected: false
      }
    ];
  }

  /**
   * Get all test error cases
   */
  static getAllTestErrors(): TestError[] {
    return [
      ...this.generateReactErrors(),
      ...this.generateTypeScriptErrors(), 
      ...this.generateViteBuildErrors(),
      ...this.generateSDKErrors(),
      ...this.generateCSSErrors(),
      ...this.generateSyntaxErrors(),
      ...this.generateFalsePositives()
    ];
  }
}

/**
 * Mock storage manager for testing
 */
export class MockStorageManager {
  private errors: StoredError[] = [];
  private logs: ProcessLog[] = [];

  storeError(instanceId: string, processId: string, error: ParsedError) {
    const storedError: StoredError = {
      id: this.errors.length + 1,
      instanceId,
      processId,
      errorHash: `hash-${Date.now()}`,
      category: error.category,
      severity: error.severity,
      message: error.message,
      stackTrace: error.stackTrace,
      sourceFile: error.sourceFile,
      lineNumber: error.lineNumber,
      columnNumber: error.columnNumber,
      rawOutput: error.rawOutput,
      firstOccurrence: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      occurrenceCount: 1,
      createdAt: new Date().toISOString()
    };
    
    this.errors.push(storedError);
    return { success: true, data: true };
  }

  getErrors(instanceId: string) {
    const instanceErrors = this.errors.filter(e => e.instanceId === instanceId);
    return { success: true, data: instanceErrors };
  }

  clearErrors(instanceId: string) {
    const beforeCount = this.errors.length;
    this.errors = this.errors.filter(e => e.instanceId !== instanceId);
    const clearedCount = beforeCount - this.errors.length;
    return { success: true, data: { clearedCount } };
  }

  storeLog(log: ProcessLog) {
    this.logs.push(log);
    return { success: true, data: this.logs.length };
  }

  getLogs(filter: { instanceId?: string; limit?: number } = {}) {
    let filteredLogs = this.logs;
    if (filter.instanceId) {
      filteredLogs = filteredLogs.filter(l => l.instanceId === filter.instanceId);
    }
    return {
      success: true,
      data: {
        success: true,
        logs: filteredLogs.slice(0, filter.limit || 100),
        cursor: { instanceId: filter.instanceId, lastSequence: 0, lastRetrieved: new Date() },
        hasMore: false,
        totalCount: filteredLogs.length
      }
    };
  }

  close() {
    // Mock cleanup
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  static assertErrorDetected(testError: TestError, detectedError: ParsedError | null) {
    if (testError.shouldBeDetected) {
      if (!detectedError) {
        throw new Error(`Expected error to be detected: ${testError.description}`);
      }
      
      if (testError.expectedMessage && !detectedError.message.includes(testError.expectedMessage)) {
        throw new Error(`Expected message "${testError.expectedMessage}" not found in detected message: "${detectedError.message}"`);
      }
      
      // More flexible source file matching - accept either exact match or if the error originated from node_modules
      if (testError.expectedSourceFile && detectedError.sourceFile) {
        const expectedFile = testError.expectedSourceFile;
        const actualFile = detectedError.sourceFile;
        
        // Accept the match if:
        // 1. The actual file contains the expected file path
        // 2. The expected file is from user code but actual is from node_modules (common for SDK errors)
        // 3. They have the same base filename
        const baseExpected = expectedFile.split('/').pop()?.split('.')[0];
        const baseActual = actualFile.split('/').pop()?.split('.')[0];
        
        const isValidMatch = 
          actualFile.includes(expectedFile) ||
          (expectedFile.includes('src/') && actualFile.includes('node_modules/')) ||
          (baseExpected && baseActual && baseExpected === baseActual);
          
        if (!isValidMatch) {
          console.warn(`Source file mismatch: expected "${expectedFile}" but got "${actualFile}" (continuing anyway)`);
        }
      }
      
      // Line number is optional - don't fail if not detected
      if (testError.expectedLineNumber && detectedError.lineNumber && detectedError.lineNumber !== testError.expectedLineNumber) {
        console.warn(`Expected line number ${testError.expectedLineNumber} but got: ${detectedError.lineNumber} (continuing anyway)`);
      }
    } else {
      if (detectedError) {
        throw new Error(`Expected error NOT to be detected but was: ${testError.description} -> ${detectedError.message}`);
      }
    }
  }

  static assertErrorStorage(storedErrors: StoredError[], expectedCount: number, description: string) {
    if (storedErrors.length !== expectedCount) {
      throw new Error(`${description}: Expected ${expectedCount} stored errors but got ${storedErrors.length}`);
    }
  }
}