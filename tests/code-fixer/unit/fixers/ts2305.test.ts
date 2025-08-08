/**
 * TS2305 Fixer Tests - Module has no exported member
 * Tests the fixer that adds missing exports to target files
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { fixMissingExportedMember } from '../../../../src/code-fixer/fixers/ts2305';
import { FixerContext } from '../../../../src/code-fixer/types';
import { CodeIssue } from '../../../../src/sandbox/sandboxTypes';
import { createMockFileFetcher } from '../../mocks/file-fetcher.mock';
import { setupFixerAssertions } from '../../test-utils/assertion-helpers';

beforeAll(() => {
    setupFixerAssertions();
});

describe('TS2305 Fixer - Missing Exported Member', () => {
    
    function createContext(mockFileSystem: Record<string, string>, options: any = {}): FixerContext {
        const { fetcher } = createMockFileFetcher(mockFileSystem, options);
        return {
            files: new Map(),
            fileFetcher: fetcher,
            fetchedFiles: new Set()
        };
    }
    
    describe('Basic Export Addition', () => {
        test('should add missing named export to existing file', async () => {
            const context = createContext({
                'src/App.tsx': `
import { TestComponent } from './test';

export default function App() {
    return <TestComponent />;
}`,
                'src/test.tsx': `
import React from 'react';

export function ExistingComponent() {
    return <div>Existing</div>;
}

// Missing TestComponent export - will be added by fixer
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './test' has no exported member 'TestComponent'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/test.tsx', ['TestComponent']);
            expect(result).toHaveNoErrors();
            
            // Verify the export was added
            const fileContent = result.modifiedFiles.find(f => f.file_path === 'src/test.tsx')?.file_contents;
            expect(fileContent).toContain('export const TestComponent');
            expect(fileContent).toContain('STUB');
        });
        
        test('should detect external modules and skip them', async () => {
            const context = createContext({});
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module 'react' has no exported member 'NonExistentHook'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'External package');
            expect(result).toHaveFileCount(0);
        });
        
        test('should handle multiple missing exports in same file', async () => {
            const context = createContext({
                'src/App.tsx': `
import { ComponentA, ComponentB, ComponentC } from './components';

export default function App() {
    return (
        <div>
            <ComponentA />
            <ComponentB />
            <ComponentC />
        </div>
    );
}`,
                'src/components.tsx': `
import React from 'react';

// Missing all three components - will be added
`
            });
            
            const issues: CodeIssue[] = [
                {
                    ruleId: 'TS2305',
                    filePath: 'src/App.tsx',
                    line: 2,
                    column: 10,
                    message: "Module './components' has no exported member 'ComponentA'.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2305',
                    filePath: 'src/App.tsx',
                    line: 2,
                    column: 22,
                    message: "Module './components' has no exported member 'ComponentB'.",
                    severity: 'error'
                },
                {
                    ruleId: 'TS2305',
                    filePath: 'src/App.tsx',
                    line: 2,
                    column: 34,
                    message: "Module './components' has no exported member 'ComponentC'.",
                    severity: 'error'
                }
            ];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result.fixedIssues).toHaveLength(3);
            expect(result).toHaveModifiedFile('src/components.tsx', ['ComponentA', 'ComponentB', 'ComponentC']);
        });
    });
    
    describe('Duplicate Export Prevention', () => {
        test('should not add export if named export already exists', async () => {
            const context = createContext({
                'src/App.tsx': `
import { ExistingComponent } from './test';`,
                'src/test.tsx': `
import React from 'react';

export function ExistingComponent() {
    return <div>Already exists</div>;
}`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './test' has no exported member 'ExistingComponent'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'already exists');
            expect(result).toHaveFileCount(0);
        });
        
        test('should not add export if default export with same name exists', async () => {
            const context = createContext({
                'src/App.tsx': `
import { MyComponent } from './test';`,
                'src/test.tsx': `
import React from 'react';

function MyComponent() {
    return <div>Default export</div>;
}

export default MyComponent;`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './test' has no exported member 'MyComponent'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'Default export MyComponent already exists');
            expect(result).toHaveFileCount(0);
        });
    });
    
    describe('Smart Stub Generation', () => {
        test('should generate React component stub for JSX usage', async () => {
            const context = createContext({
                'src/App.tsx': `
import { MyButton } from './components';

export default function App() {
    return <MyButton onClick={() => alert('clicked')} />;
}`,
                'src/components.tsx': `
import React from 'react';
// Missing MyButton component
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './components' has no exported member 'MyButton'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            const fileContent = result.modifiedFiles[0]?.file_contents;
            expect(fileContent).toContain('React.ReactElement');
            expect(fileContent).toContain('<div>');
            expect(fileContent).toContain('MyButton');
        });
        
        test('should generate function stub for function call usage', async () => {
            const context = createContext({
                'src/App.tsx': `
import { calculateSum } from './math';

const result = calculateSum(1, 2, 3);`,
                'src/math.tsx': `
// Missing calculateSum function
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './math' has no exported member 'calculateSum'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            const fileContent = result.modifiedFiles[0]?.file_contents;
            expect(fileContent).toContain('function calculateSum');
            expect(fileContent).toContain('console.warn');
            expect(fileContent).toContain('STUB');
        });
        
        test('should generate object stub for property access usage', async () => {
            const context = createContext({
                'src/App.tsx': `
import { config } from './settings';

const apiUrl = config.baseUrl;
const version = config.version;`,
                'src/settings.tsx': `
// Missing config object
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './settings' has no exported member 'config'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            const fileContent = result.modifiedFiles[0]?.file_contents;
            expect(fileContent).toContain('const config');
            expect(fileContent).toContain('baseUrl');
            expect(fileContent).toContain('version');
        });
        
        test('should generate generic stub for unknown usage patterns', async () => {
            const context = createContext({
                'src/App.tsx': `
import { unknownThing } from './mystery';

// Usage pattern not clear
const x = unknownThing;`,
                'src/mystery.tsx': `
// Missing unknownThing
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './mystery' has no exported member 'unknownThing'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            const fileContent = result.modifiedFiles[0]?.file_contents;
            expect(fileContent).toContain('const unknownThing');
            expect(fileContent).toContain('STUB');
        });
    });
    
    describe('Path Resolution Integration', () => {
        test('should correctly resolve ./test from src/App.tsx to src/test.tsx', async () => {
            const context = createContext({
                'src/App.tsx': `
import { TestComponent } from './test';

export default function App() {
    return <TestComponent />;
}`,
                'src/test.tsx': `
import React from 'react';

export function Sparkles() {
    return <div>✨</div>;
}

// Missing TestComponent - should be added
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './test' has no exported member 'TestComponent'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            // This is the critical test - verifies the path resolution fix
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/test.tsx', ['TestComponent']);
            
            const fileContent = result.modifiedFiles[0]?.file_contents;
            expect(fileContent).toContain('export function Sparkles'); // Existing export preserved
            expect(fileContent).toContain('export const TestComponent'); // New export added
        });
        
        test('should handle complex relative paths', async () => {
            const context = createContext({
                'src/components/forms/Input.tsx': `
import { validateInput } from '../../../utils/validation';`,
                'src/utils/validation.ts': `
// Missing validateInput function
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/components/forms/Input.tsx',
                line: 2,
                column: 10,
                message: "Module '../../../utils/validation' has no exported member 'validateInput'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveFixedIssue('TS2305', 'src/components/forms/Input.tsx');
            expect(result).toHaveModifiedFile('src/utils/validation.ts', ['validateInput']);
        });
        
        test('should handle alias paths (@/path)', async () => {
            const context = createContext({
                'src/App.tsx': `
import { ConfigValue } from '@/config/settings';`,
                'src/config/settings.ts': `
// Missing ConfigValue
`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module '@/config/settings' has no exported member 'ConfigValue'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/config/settings.ts', ['ConfigValue']);
        });
    });
    
    describe('Error Handling', () => {
        test('should handle target file not found', async () => {
            const context = createContext({
                'src/App.tsx': `
import { MissingComponent } from './nonexistent';`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './nonexistent' has no exported member 'MissingComponent'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'Could not resolve');
            expect(result).toHaveFileCount(0);
        });
        
        test('should handle source file parsing errors', async () => {
            const context = createContext({
                'src/App.tsx': `
import { Test } from './target';
// Malformed syntax that prevents parsing
function App( {
    return <div>broken</div>
}`,
                'src/target.tsx': `export function ExistingFunction() {}`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './target' has no exported member 'Test'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            // Should handle parsing errors gracefully
            expect(result.unfixableIssues.length).toBe(1);
        });
        
        test('should handle invalid export names', async () => {
            const context = createContext({
                'src/App.tsx': `
import { } from './target'; // Empty import`,
                'src/target.tsx': `// Target file`
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './target' has no exported member ''.", // Empty name
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'Could not determine');
        });
        
        test('should handle file fetching failures', async () => {
            const context = createContext({
                'src/App.tsx': `
import { Test } from './target';`
            }, {
                simulateErrors: ['src/target.tsx']
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './target' has no exported member 'Test'.",
                severity: 'error'
            }];
            
            const result = await fixMissingExportedMember(context, issues);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx');
        });
    });
    
    describe('Performance Tests', () => {
        test('should handle large files efficiently', async () => {
            // Create a large target file with many existing exports
            const largeTargetFile = `
import React from 'react';

${Array.from({length: 100}, (_, i) => 
    `export function Component${i}() { return <div>Component ${i}</div>; }`
).join('\n')}

// Missing NewComponent - will be added
`;
            
            const context = createContext({
                'src/App.tsx': `
import { NewComponent } from './large-target';`,
                'src/large-target.tsx': largeTargetFile
            });
            
            const issues: CodeIssue[] = [{
                ruleId: 'TS2305',
                filePath: 'src/App.tsx',
                line: 2,
                column: 10,
                message: "Module './large-target' has no exported member 'NewComponent'.",
                severity: 'error'
            }];
            
            const startTime = Date.now();
            const result = await fixMissingExportedMember(context, issues);
            const elapsed = Date.now() - startTime;
            
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
        });
    });
});