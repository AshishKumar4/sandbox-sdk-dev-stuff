# Process Monitoring and Error Detection Tests

This comprehensive test suite validates the process monitoring and error detection system, ensuring robust handling of all types of development and runtime errors.

## Test Structure

```
tests/
├── unit/                          # Unit tests for individual components
│   ├── error-detection.test.ts    # Error detection and classification tests
│   └── cli-tools.test.ts          # CLI tools functionality tests
├── integration/                   # Integration tests for full workflows
│   └── process-monitoring.test.ts # End-to-end process monitoring tests
├── fixtures/                     # Test data and samples
│   └── error-samples.ts          # Real-world error samples
├── mocks/                        # Mock implementations for testing
├── test-utils.ts                 # Shared testing utilities
├── run-all-tests.ts              # Comprehensive test runner
└── package.json                  # Test-specific dependencies
```

## Error Types Covered

### React Errors
- ✅ **Maximum update depth exceeded** - Infinite rendering loops
- ✅ **Nested Router components** - React Router context errors
- ✅ **Component export issues** - Invalid element types from import/export mismatches
- ✅ **JSX syntax errors** - Malformed JSX and component syntax

### TypeScript/Node Runtime Errors
- ✅ **Undefined properties** - `Cannot read properties of undefined (reading 'prop')`
- ✅ **Module resolution errors** - Missing imports and incorrect paths
- ✅ **Reference errors** - Undefined variables and constants
- ✅ **Constant reassignments** - Assignment to const variables
- ✅ **Duplicate definitions** - Duplicate identifiers and interfaces

### Vite Build and Compilation Errors
- ✅ **Build failures** - Rollup resolution errors
- ✅ **Transform failures** - ESBuild syntax errors
- ✅ **CSS import errors** - Missing stylesheets and asset resolution
- ✅ **Critical Vite errors** - Actual compilation issues

### Third-party SDK Errors
- ✅ **OpenAI API errors** - Authentication, rate limiting, invalid requests
- ✅ **Database connection errors** - ECONNREFUSED, timeout, authentication
- ✅ **HTTP client errors** - Fetch failures, network issues, DNS resolution
- ✅ **Common SDK patterns** - Error handling across popular libraries

### CSS and Styling Errors
- ✅ **CSS syntax errors** - Malformed CSS, missing brackets, invalid properties
- ✅ **Tailwind CSS errors** - Invalid utility classes, configuration issues
- ✅ **PostCSS errors** - Plugin failures and processing errors

### Syntax and Parsing Errors
- ✅ **Missing brackets/semicolons** - Incomplete code structures
- ✅ **Invalid characters** - Unusual characters causing parse failures
- ✅ **Unexpected tokens** - Malformed JavaScript/TypeScript syntax
- ✅ **Incomplete code** - Partial function definitions and statements

### False Positive Prevention
- ✅ **Vite dev server messages** - Command echoes, port notifications
- ✅ **Development server output** - Normal startup messages
- ✅ **Inspector port messages** - Node.js debugging port changes
- ✅ **Build success messages** - Compilation completion notifications

## Running Tests

### Run All Tests
```bash
# Comprehensive test runner with detailed reporting
bun run tests/run-all-tests.ts
```

### Run Specific Test Suites
```bash
# Unit tests only
bun test tests/unit/

# Integration tests only  
bun test tests/integration/

# Specific test file
bun test tests/unit/error-detection.test.ts
```

### Watch Mode
```bash
# Watch all tests
bun test --watch tests/

# Watch specific suite
bun test --watch tests/unit/error-detection.test.ts
```

### Coverage Reports
```bash
# Run with coverage
bun test --coverage tests/
```

## Test Configuration

### Environment Variables
```bash
# Test data directory (auto-configured)
CLI_DATA_DIR=./tests/temp

# Test database paths (auto-configured)
CLI_ERROR_DB_PATH=./tests/temp/test-errors.db
CLI_LOG_DB_PATH=./tests/temp/test-logs.db

# Test environment flag
NODE_ENV=test
```

### Test Utilities

The test suite includes comprehensive utilities:

- **TestErrorGenerator** - Generates realistic error samples for all categories
- **TestAssertions** - Custom assertions for error detection validation
- **MockStorageManager** - In-memory storage for isolated testing
- **Error Sample Fixtures** - Real-world error messages from production systems

## Key Test Features

### 1. Real Error Simulation
Tests use actual error messages from:
- React development environments
- TypeScript compilation
- Vite build processes
- Popular npm packages (OpenAI, database drivers, etc.)
- Real CSS parsing errors

### 2. False Positive Prevention
Extensive testing ensures development server messages are NOT flagged as errors:
- Vite command echoes in stderr
- Inspector port change notifications
- Normal development server startup messages
- HMR (Hot Module Replacement) updates

### 3. Integration Testing
Full process monitoring workflow testing:
- Process spawning and monitoring
- Real-time error detection
- Process restart logic
- Log collection and classification
- Error storage and retrieval

### 4. CLI Tools Validation
Comprehensive CLI functionality testing:
- Error listing and filtering
- Log retrieval with reset functionality
- Statistics generation
- Output formatting (JSON, table, raw)
- Parameter validation

## Expected Test Results

When all tests pass, you should see:
```
🎉 All tests passed! XXX/XXX tests successful
⏱️  Total time: XXXXms

✨ Process monitoring and error detection system is working correctly!

📝 Test Coverage Summary:
   ✅ React error detection (infinite loops, router, components)
   ✅ TypeScript/Node runtime errors (undefined props, imports)
   ✅ Vite build and compilation errors
   ✅ Third-party SDK errors (OpenAI, database, fetch)
   ✅ CSS and syntax error detection
   ✅ False positive prevention (Vite dev server messages)
   ✅ CLI tools functionality
   ✅ Process monitoring and restart logic
   ✅ Log collection and classification
   ✅ Error storage and retrieval
```

## Adding New Tests

### For New Error Types
1. Add error samples to `fixtures/error-samples.ts`
2. Create test cases in appropriate test file
3. Update `TestErrorGenerator` with new categories
4. Add assertions for expected behavior

### For New CLI Features
1. Add tests to `unit/cli-tools.test.ts`
2. Test both success and failure cases
3. Validate output formatting
4. Test parameter validation

### For New Integration Scenarios
1. Add to `integration/process-monitoring.test.ts`
2. Test full workflow end-to-end
3. Validate error storage and retrieval
4. Test process restart scenarios

## Debugging Failed Tests

### Common Issues
1. **Database path conflicts** - Ensure temp directories are properly cleaned
2. **Process timeout** - Increase timeout for slow integration tests
3. **File permission errors** - Check temp directory permissions
4. **Import path issues** - Verify relative imports in test files

### Debug Commands
```bash
# Run with verbose output
bun test --verbose tests/

# Run single test with debugging
bun test tests/unit/error-detection.test.ts --verbose

# Check test environment
echo $CLI_DATA_DIR
echo $NODE_ENV
```

This test suite ensures the process monitoring system correctly identifies all types of development and runtime errors while avoiding false positives from normal development server output.