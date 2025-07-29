#!/usr/bin/env bun

/**
 * Quick validation script to ensure all test files are properly structured
 */

import { promises as fs } from 'fs';
import { join } from 'path';

async function validateTests() {
  console.log('🔍 Validating test files...\n');

  const testFiles = [
    'unit/error-detection.test.ts',
    'unit/cli-tools.test.ts', 
    'integration/process-monitoring.test.ts',
    'test-utils.ts',
    'fixtures/error-samples.ts'
  ];

  let allValid = true;

  for (const testFile of testFiles) {
    const filePath = join(process.cwd(), 'tests', testFile);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Basic validation checks
      const hasImports = content.includes('import');
      const hasTests = content.includes('test(') || content.includes('describe(');
      const hasExpects = content.includes('expect(') || content.includes('TestAssertions');
      
      if (testFile.endsWith('.test.ts')) {
        if (!hasImports || !hasTests || !hasExpects) {
          console.log(`❌ ${testFile}: Missing required test structure`);
          allValid = false;
        } else {
          console.log(`✅ ${testFile}: Valid test file`);
        }
      } else {
        if (!hasImports) {
          console.log(`❌ ${testFile}: Missing imports`);
          allValid = false;
        } else {
          console.log(`✅ ${testFile}: Valid utility file`);
        }
      }
      
      // Check for syntax errors by attempting to parse
      try {
        const { transpiler } = require('bun');
        transpiler.scanImports(content);
        console.log(`   📝 Syntax check passed`);
      } catch (error) {
        console.log(`   ❌ Syntax error: ${error}`);
        allValid = false;
      }
      
    } catch (error) {
      console.log(`❌ ${testFile}: Cannot read file - ${error}`);
      allValid = false;
    }
  }

  console.log('\n' + '═'.repeat(50));
  
  if (allValid) {
    console.log('🎉 All test files are valid and ready to run!');
    console.log('\nNext steps:');
    console.log('1. Run comprehensive tests: bun run tests/run-all-tests.ts');
    console.log('2. Run specific suite: bun test tests/unit/');
    console.log('3. Watch mode: bun test --watch tests/');
  } else {
    console.log('❌ Some test files have issues. Please fix them before running tests.');
    process.exit(1);
  }
}

// Run validation
validateTests().catch(error => {
  console.error('💥 Validation failed:', error);
  process.exit(1);
});