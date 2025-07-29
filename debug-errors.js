import { ErrorDetector } from './container/process-monitor.js';

const detector = new ErrorDetector();

// Test the failing cases
const testCases = [
  {
    name: "OpenAI API error",
    input: `OpenAIError: 401 Unauthorized - Incorrect API key provided
    at APIError.generate (/app/node_modules/openai/error.js:44:20)
    at OpenAI.makeStatusError (/app/node_modules/openai/core.js:263:25)
    at OpenAI.makeRequest (/app/node_modules/openai/core.js:306:24)
    at generateCompletion (/app/src/services/ai.ts:28:18)`,
    expected: 'runtime',
    expectedMessage: "401 Unauthorized - Incorrect API key provided",
    expectedSourceFile: "ai.ts"
  },
  {
    name: "Database connection error",
    input: `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1157:16)
    at connectToDatabase (/app/src/lib/database.ts:45:12)
    at initializeApp (/app/src/main.ts:15:8)`,
    expected: 'runtime',
    expectedMessage: "connect ECONNREFUSED 127.0.0.1:5432",
    expectedSourceFile: "database.ts"
  }
];

for (const testCase of testCases) {
  console.log(`\n=== Testing: ${testCase.name} ===`);
  console.log('Raw input lines:');
  testCase.input.split('\\n').forEach((line, i) => console.log(`  ${i}: "${line}"`));
  const result = detector.parseError(testCase.input, { stream: 'stderr' });
  if (result) {
    console.log(`Pattern ID: ${result.patternId || 'fallback'}`);
    console.log(`Category: ${result.category} (expected: ${testCase.expected})`);
    console.log(`Message: "${result.message}"`);
    console.log(`SourceFile: "${result.sourceFile || 'undefined'}"`);
    console.log(`LineNumber: ${result.lineNumber || 'undefined'}`);
    
    if (testCase.expectedMessage) {
      console.log(`Expected Message: "${testCase.expectedMessage}"`);
      console.log(`Message Match: ${result.message.includes(testCase.expectedMessage) ? 'PASS' : 'FAIL'}`);
    }
    if (testCase.expectedSourceFile) {
      const hasCorrectFile = result.sourceFile?.includes(testCase.expectedSourceFile);
      console.log(`Expected SourceFile: "${testCase.expectedSourceFile}"`);
      console.log(`SourceFile Match: ${hasCorrectFile ? 'PASS' : 'FAIL'}`);
    }
    if (testCase.expectedLineNumber) {
      console.log(`Expected LineNumber: ${testCase.expectedLineNumber}`);
      console.log(`LineNumber Match: ${result.lineNumber === testCase.expectedLineNumber ? 'PASS' : 'FAIL'}`);
    }
    console.log(`Category Match: ${result.category === testCase.expected ? 'PASS' : 'FAIL'}`);
  } else {
    console.log('NO ERROR DETECTED');
  }
}