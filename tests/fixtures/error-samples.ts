/**
 * Real-world error samples for comprehensive testing
 */

export const ERROR_SAMPLES = {
  // React Errors
  REACT_INFINITE_LOOP: `
Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.
    at checkForNestedUpdates (/app/node_modules/react-dom/cjs/react-dom.development.js:25463:15)
    at scheduleUpdateOnFiber (/app/node_modules/react-dom/cjs/react-dom.development.js:21840:5)
    at Object.enqueueSetState (/app/node_modules/react-dom/cjs/react-dom.development.js:14642:3)
    at UserProfile.setState (/app/node_modules/react/cjs/react.development.js:365:16)
    at UserProfile.render (/app/src/components/UserProfile.tsx:42:10)
  `,

  REACT_ROUTER_ERROR: `
Error: useNavigate() may be used only in the context of a <Router> component.
    at useNavigate (/app/node_modules/react-router/dist/index.js:142:11)
    at NavigationButton (/app/src/components/Navigation.tsx:15:20)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:16305:18)
    at mountIndeterminateComponent (/app/node_modules/react-dom/cjs/react-dom.development.js:20074:13)
  `,

  REACT_COMPONENT_TYPE_ERROR: `
Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.

Check the render method of \`App\`.
    at createFiberFromTypeAndProps (/app/node_modules/react-dom/cjs/react-dom.development.js:27469:21)
    at createFiberFromElement (/app/node_modules/react-dom/cjs/react-dom.development.js:27495:15)
    at reconcileChildFibers (/app/node_modules/react-dom/cjs/react-dom.development.js:15893:35)
  `,

  // TypeScript/JavaScript Errors
  UNDEFINED_PROPERTY: `
TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:25:31)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:16305:18)
    at mountIndeterminateComponent (/app/node_modules/react-dom/cjs/react-dom.development.js:20074:13)
    at beginWork (/app/node_modules/react-dom/cjs/react-dom.development.js:21587:16)
  `,

  MODULE_NOT_FOUND: `
Error: Cannot resolve module './utils/nonexistent' from '/app/src/components/Dashboard.tsx'
    at resolveModule (/app/node_modules/vite/dist/node/chunks/dep-df561101.js:44403:21)
    at resolveId (/app/node_modules/vite/dist/node/chunks/dep-df561101.js:44268:33)
    at Object.resolveId (/app/node_modules/vite/dist/node/chunks/dep-df561101.js:44033:55)
  `,

  REFERENCE_ERROR: `
ReferenceError: someUndefinedVariable is not defined
    at calculateTotal (/app/src/utils/math.ts:34:12)
    at processOrder (/app/src/services/order.ts:89:25)
    at OrderPage (/app/src/pages/OrderPage.tsx:67:18)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:16305:18)
  `,

  CONST_ASSIGNMENT: `
TypeError: Assignment to constant variable.
    at updateConfig (/app/src/config/settings.ts:15:5)
    at initialize (/app/src/main.ts:23:7)
    at Module.<anonymous> (/app/src/main.ts:45:1)
    at Object.Module._extensions..ts (/app/node_modules/ts-node/src/index.ts:1608:43)
  `,

  DUPLICATE_IDENTIFIER: `
Error: Duplicate identifier 'UserType'. 
/app/src/types/user.ts(12,13): 'UserType' was also declared here.
    at checkDuplicateIdentifier (/app/node_modules/typescript/lib/typescript.js:42156:22)
    at checkTypeDeclaration (/app/node_modules/typescript/lib/typescript.js:42287:17)
    at checkSourceFileWorker (/app/node_modules/typescript/lib/typescript.js:105143:13)
  `,

  // Vite Build Errors
  VITE_BUILD_FAILED: `
[vite:build] Rollup failed to resolve import "./components/MissingComponent" from "src/App.tsx".
Error: Could not resolve "./components/MissingComponent" from src/App.tsx
    at error (/app/node_modules/rollup/dist/shared/rollup.js:158:30)
    at ModuleLoader.handleResolveId (/app/node_modules/rollup/dist/shared/rollup.js:22541:24)
    at /app/node_modules/rollup/dist/shared/rollup.js:22505:26
  `,

  VITE_TRANSFORM_FAILED: `
[vite] Internal server error: Transform failed with 1 error:
/app/src/components/BrokenComponent.tsx:15:25: ERROR: Expected "}" but found ";"
  15 │     return <div className={;
     ╵                            ^

    at failureErrorWithLog (/app/node_modules/esbuild/lib/main.js:1603:15)
    at /app/node_modules/esbuild/lib/main.js:1249:28
    at runOnEndCallbacks (/app/node_modules/esbuild/lib/main.js:1034:63)
  `,

  VITE_CSS_ERROR: `
[vite] Pre-transform error: Failed to resolve import "./styles/nonexistent.css" from "src/App.tsx"
    at formatError (/app/node_modules/vite/dist/node/chunks/dep-f0e4b793.js:49830:46)
    at TransformContext.error (/app/node_modules/vite/dist/node/chunks/dep-f0e4b793.js:49826:19)
    at TransformContext.resolve (/app/node_modules/vite/dist/node/chunks/dep-f0e4b793.js:49744:28)
  `,

  // Third-party SDK Errors
  OPENAI_API_ERROR: `
OpenAIError: 401 Unauthorized - Incorrect API key provided: sk-proj-************. You can find your API key at https://platform.openai.com/account/api-keys.
    at APIError.generate (/app/node_modules/openai/error.js:44:20)
    at OpenAI.makeStatusError (/app/node_modules/openai/core.js:263:25)
    at OpenAI.makeRequest (/app/node_modules/openai/core.js:306:24)
    at async OpenAI.makeRequestWithRetries (/app/node_modules/openai/core.js:324:14)
    at async generateCompletion (/app/src/services/ai.ts:28:18)
  `,

  DATABASE_CONNECTION_ERROR: `
Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1157:16)
    at connectToDatabase (/app/src/lib/database.ts:45:12)
    at initializeApp (/app/src/main.ts:15:8)
    at Object.<anonymous> (/app/src/main.ts:78:1)
  `,

  FETCH_API_ERROR: `
TypeError: fetch failed
    cause: Error: getaddrinfo ENOTFOUND api.example.com
        at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:107:26) {
      errno: -3008,
      code: 'ENOTFOUND',
      syscall: 'getaddrinfo',
      hostname: 'api.example.com'
    }
    at Object.fetch (node:internal/deps/undici/undici:11576:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async apiCall (/app/src/services/api.ts:52:20)
    at async fetchUserData (/app/src/hooks/useUser.ts:34:16)
  `,

  // CSS and Styling Errors
  CSS_PARSE_ERROR: `
[vite:css] Unexpected } at 1:25
1 | .my-class { color: red; } }
  |                         ^
    at Input.error (/app/node_modules/postcss/lib/input.js:148:16)
    at Parser.other (/app/node_modules/postcss/lib/parser.js:288:18)
    at Parser.parse (/app/node_modules/postcss/lib/parser.js:56:16)
  `,

  TAILWIND_ERROR: `
[vite:css] [postcss] Cannot find utility class 'invalid-tailwind-class' in Tailwind CSS
  at processTailwind (/app/node_modules/@tailwindcss/postcss7-compat/src/index.js:128:13)
  at /app/src/styles/globals.css:15:3
  `,

  // Syntax Errors
  SYNTAX_ERROR_MISSING_BRACKET: `
SyntaxError: Unexpected end of input
    at wrapSafe (node:internal/modules/cjs/loader:1032:16)
    at Module._compile (node:internal/modules/cjs/loader:1067:27)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1157:10)
    at Module.load (node:internal/modules/cjs/loader:932:32)
    at Function.Module._load (node:internal/modules/cjs/loader:773:14)
    at Module.require (/app/src/utils/parser.js:24:32)
  `,

  SYNTAX_ERROR_INVALID_TOKEN: `
SyntaxError: Invalid or unexpected token
    at new Function (<anonymous>)
    at evalCode (/app/src/dynamic/evaluator.ts:18:5)
    at processUserInput (/app/src/services/interpreter.ts:45:12)
    at MessageHandler (/app/src/components/ChatBox.tsx:89:23)
  `,

  SYNTAX_ERROR_UNEXPECTED_TOKEN: `
SyntaxError: Unexpected token '}'
    at checkSyntax (/app/src/compiler/validator.ts:67:15)
    at validateCode (/app/src/compiler/index.ts:34:8)
    at CodeEditor (/app/src/components/CodeEditor.tsx:156:18)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:16305:18)
  `,

  // False Positives (should NOT be detected as errors)
  VITE_COMMAND_ECHO: `$ vite --host 0.0.0.0 --port \${PORT:-3000}`,
  
  VITE_STDERR_ECHO: `ERROR: $ vite --host 0.0.0.0 --port \${PORT:-3000}`,
  
  INSPECTOR_PORT_MESSAGE: `Default inspector port 9229 not available, using 9230 instead`,
  
  INSPECTOR_PORT_ERROR: `ERROR: Default inspector port 9229 not available, using 9230 instead`,
  
  VITE_READY_MESSAGE: `VITE v6.3.5  ready in 722 ms`,
  
  VITE_LOCAL_URL: `Local:   http://localhost:3000/`,
  
  VITE_NETWORK_URL: `Network: http://192.168.1.100:3000/`,
  
  VITE_FORMATTED_URL: `➜  Local:   http://localhost:3000/`,
  
  VITE_HMR_UPDATE: `[vite] hmr update /src/App.tsx`,
  
  VITE_PAGE_RELOAD: `[vite] page reload src/main.tsx (hmr update failed)`,
  
  PROCESS_STARTED: `Process started: bun run dev`,
  
  BUN_RUNTIME_MESSAGE: `[bun] starting dev server...`,
  
  COMPILATION_SUCCESS: `compiled successfully in 1.2s`
};

// Categories for testing
export const ERROR_CATEGORIES = {
  REACT_ERRORS: [
    ERROR_SAMPLES.REACT_INFINITE_LOOP,
    ERROR_SAMPLES.REACT_ROUTER_ERROR,
    ERROR_SAMPLES.REACT_COMPONENT_TYPE_ERROR
  ],
  
  TYPESCRIPT_ERRORS: [
    ERROR_SAMPLES.UNDEFINED_PROPERTY,
    ERROR_SAMPLES.MODULE_NOT_FOUND,
    ERROR_SAMPLES.REFERENCE_ERROR,
    ERROR_SAMPLES.CONST_ASSIGNMENT,
    ERROR_SAMPLES.DUPLICATE_IDENTIFIER
  ],
  
  VITE_ERRORS: [
    ERROR_SAMPLES.VITE_BUILD_FAILED,
    ERROR_SAMPLES.VITE_TRANSFORM_FAILED,
    ERROR_SAMPLES.VITE_CSS_ERROR
  ],
  
  SDK_ERRORS: [
    ERROR_SAMPLES.OPENAI_API_ERROR,
    ERROR_SAMPLES.DATABASE_CONNECTION_ERROR,
    ERROR_SAMPLES.FETCH_API_ERROR
  ],
  
  CSS_ERRORS: [
    ERROR_SAMPLES.CSS_PARSE_ERROR,
    ERROR_SAMPLES.TAILWIND_ERROR
  ],
  
  SYNTAX_ERRORS: [
    ERROR_SAMPLES.SYNTAX_ERROR_MISSING_BRACKET,
    ERROR_SAMPLES.SYNTAX_ERROR_INVALID_TOKEN,
    ERROR_SAMPLES.SYNTAX_ERROR_UNEXPECTED_TOKEN
  ],
  
  FALSE_POSITIVES: [
    ERROR_SAMPLES.VITE_COMMAND_ECHO,
    ERROR_SAMPLES.VITE_STDERR_ECHO,
    ERROR_SAMPLES.INSPECTOR_PORT_MESSAGE,
    ERROR_SAMPLES.INSPECTOR_PORT_ERROR,
    ERROR_SAMPLES.VITE_READY_MESSAGE,
    ERROR_SAMPLES.VITE_LOCAL_URL,
    ERROR_SAMPLES.VITE_NETWORK_URL,
    ERROR_SAMPLES.VITE_FORMATTED_URL,
    ERROR_SAMPLES.VITE_HMR_UPDATE,
    ERROR_SAMPLES.VITE_PAGE_RELOAD,
    ERROR_SAMPLES.PROCESS_STARTED,
    ERROR_SAMPLES.BUN_RUNTIME_MESSAGE,
    ERROR_SAMPLES.COMPILATION_SUCCESS
  ]
};