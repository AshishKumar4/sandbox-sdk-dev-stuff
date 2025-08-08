/**
 * Full Workflow Integration Tests - Complete code fixing pipeline
 * Tests the main entry point with realistic scenarios
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { fixProjectIssues } from '../../../src/code-fixer/index';
import { FileOutputType } from '../../../src/schemas';
import { CodeIssue } from '../../../src/sandbox/sandboxTypes';
import { createMockFileFetcher } from '../mocks/file-fetcher.mock';
import { ProjectBuilder } from '../test-utils/project-builder';
import { setupFixerAssertions, measureFixerPerformance } from '../test-utils/assertion-helpers';

beforeAll(() => {
    setupFixerAssertions();
});

describe('Full Workflow Integration Tests', () => {
    
    describe('Single Issue Scenarios', () => {
        test('should fix TS2305 missing export issue end-to-end', async () => {
            const project = ProjectBuilder.reactProject()
                .addFile('src/test.tsx', `
import React from 'react';

export function Sparkles() {
    return <div>✨ Sparkles</div>;
}

// Missing TestComponent export`)
                .addIssue('TS2305', 'src/App.tsx', 3, 10, "Module './test' has no exported member 'TestComponent'")
                .build();
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': project.files.find(f => f.file_path === 'src/test.tsx')!.file_contents
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/test.tsx', ['TestComponent']);
            expect(result).toHaveNoErrors();
            expect(result).toHaveSuccessRate(1.0);
        });
        
        test('should create stub file for TS2307 missing module', async () => {
            const project = new ProjectBuilder('missing-module-test')
                .addFile('src/App.tsx', `
import React from 'react';
import { HelperFunction } from './utils/helper';

export default function App() {
    const result = HelperFunction();
    return <div>{result}</div>;
}`)
                .addIssue('TS2307', 'src/App.tsx', 3, 26, "Cannot find module './utils/helper' or its corresponding type declarations")
                .build();
            
            const result = await fixProjectIssues(project.files, project.issues);
            
            expect(result).toHaveFixedIssue('TS2307', 'src/App.tsx');
            expect(result).toHaveCreatedFile('src/utils/helper.tsx', 'HelperFunction');
            expect(result).toHaveSuccessRate(1.0);
        });
        
        test('should fix TS2613 import/export mismatch', async () => {
            const project = new ProjectBuilder('import-mismatch-test')
                .addFile('src/main.tsx', `
import App from './App';

export function Main() {
    return <App />;
}`)
                .addFile('src/App.tsx', `
// Named export, not default
export function App() {
    return <div>App Component</div>;
}`)
                .addIssue('TS2613', 'src/main.tsx', 2, 8, "Module './App' has no default export. Did you mean to use 'import { App } from \"./App\"' instead?")
                .build();
            
            const { fetcher } = createMockFileFetcher({
                'src/App.tsx': project.files.find(f => f.file_path === 'src/App.tsx')!.file_contents
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            expect(result).toHaveFixedIssue('TS2613', 'src/main.tsx');
            expect(result).toHaveModifiedFile('src/main.tsx', ['import { App }']);
            expect(result).toHaveSuccessRate(1.0);
        });
        
        test('should fix TS2614 import type mismatch', async () => {
            const project = new ProjectBuilder('type-mismatch-test')
                .addFile('src/main.tsx', `
import { Button } from './Button';

export function Main() {
    return <Button />;
}`)
                .addFile('src/Button.tsx', `
// Default export, not named
export default function Button() {
    return <button>Click me</button>;
}`)
                .addIssue('TS2614', 'src/main.tsx', 2, 10, "Module './Button' has no exported member 'Button'. Did you mean to use 'import Button from \"./Button\"' instead?")
                .build();
            
            const { fetcher } = createMockFileFetcher({
                'src/Button.tsx': project.files.find(f => f.file_path === 'src/Button.tsx')!.file_contents
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            expect(result).toHaveFixedIssue('TS2614', 'src/main.tsx');
            expect(result).toHaveModifiedFile('src/main.tsx', ['import Button from']);
            expect(result).toHaveSuccessRate(1.0);
        });
        
        test('should fix TS2304 undefined name', async () => {
            const project = new ProjectBuilder('undefined-name-test')
                .addFile('src/App.tsx', `
import React from 'react';

export default function App() {
    const result = undefinedFunction();
    return <div>{result}</div>;
}`)
                .addIssue('TS2304', 'src/App.tsx', 5, 20, "Cannot find name 'undefinedFunction'")
                .build();
            
            const result = await fixProjectIssues(project.files, project.issues);
            
            expect(result).toHaveFixedIssue('TS2304', 'src/App.tsx');
            expect(result).toHaveModifiedFile('src/App.tsx', ['undefinedFunction']);
            expect(result).toHaveSuccessRate(1.0);
        });
    });
    
    describe('Multi-Issue Scenarios', () => {
        test('should handle multiple different issue types in one project', async () => {
            const project = ProjectBuilder.importChainProject().build();
            
            const { fetcher } = createMockFileFetcher({
                'src/B.tsx': `
import React from 'react';

// Has some exports but missing BComponent
export function SomeOtherComponent() {
    return <div>Other</div>;
}`,
                'src/C.tsx': `
import React from 'react';

export function CComponent({ value }: { value: string }) {
    return <div>{value}</div>;
}`
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            // Should fix the resolvable issues
            expect(result.fixedIssues.length).toBeGreaterThan(0);
            
            // Should create stub files for missing modules
            const createdFiles = result.modifiedFiles.map(f => f.file_path);
            expect(createdFiles.some(path => path.includes('utils'))).toBe(true);
            expect(createdFiles.some(path => path.includes('formatters'))).toBe(true);
            
            // Should add missing exports
            expect(result).toHaveModifiedFile('src/B.tsx', ['BComponent']);
        });
        
        test('should handle complex path resolution scenarios', async () => {
            const project = ProjectBuilder.pathResolutionProject().build();
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `
import React from 'react';

export function ExistingComponent() {
    return <div>Exists</div>;
}
// Missing TestComponent`,
                'utils/helper.ts': `
export function UtilFunction(): string {
    return 'utility result';
}`,
                'src/config/settings.ts': `
export const ConfigValue = 'config-value';
`
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            // Should resolve all path-related issues
            expect(result.fixedIssues.length).toBeGreaterThan(0);
            
            // Should handle the critical path resolution bug fix
            expect(result).toHaveModifiedFile('src/test.tsx', ['TestComponent']);
            
            // Should create missing files with proper paths
            const createdPaths = result.modifiedFiles.map(f => f.file_path);
            expect(createdPaths.some(path => path.includes('icons/chevron'))).toBe(true);
            expect(createdPaths.some(path => path.includes('hooks/theme'))).toBe(true);
        });
        
        test('should handle import/export mismatch scenarios', async () => {
            const project = ProjectBuilder.importExportMismatchProject().build();
            
            const { fetcher } = createMockFileFetcher({
                'src/App.tsx': `
// Named export, not default
export function App({ children }: { children: React.ReactNode }) {
    return <div className="app">{children}</div>;
}`,
                'src/Button.tsx': `
// Default export, not named  
export default function Button() {
    return <button>Click me</button>;
}`,
                'src/utils.ts': `
// Named exports, not default
export function helper(): string {
    return 'help';
}

export function format(str: string): string {
    return str.toUpperCase();
}`
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            // Should fix all mismatch issues
            expect(result.fixedIssues.length).toBe(3);
            expect(result.unfixableIssues.length).toBe(0);
            
            // Should fix import statements
            const mainFile = result.modifiedFiles.find(f => f.file_path === 'src/main.tsx');
            expect(mainFile?.file_contents).toContain('import { App }'); // Default to named
            expect(mainFile?.file_contents).toContain('import Button from'); // Named to default
            expect(mainFile?.file_contents).toContain('import { helper }'); // Default to named destructure
        });
    });
    
    describe('External Module Handling', () => {
        test('should skip external npm packages correctly', async () => {
            const project = new ProjectBuilder('external-modules-test')
                .addFile('src/App.tsx', `
import React from 'react';
import { NonExistentExport } from 'react';
import { MissingFunction } from 'lodash';
import { BadType } from '@types/node';`)
                .addIssue('TS2305', 'src/App.tsx', 3, 10, "Module 'react' has no exported member 'NonExistentExport'")
                .addIssue('TS2305', 'src/App.tsx', 4, 10, "Module 'lodash' has no exported member 'MissingFunction'")
                .addIssue('TS2305', 'src/App.tsx', 5, 10, "Module '@types/node' has no exported member 'BadType'")
                .build();
            
            const result = await fixProjectIssues(project.files, project.issues);
            
            // All should be unfixable (external packages)
            expect(result.fixedIssues.length).toBe(0);
            expect(result.unfixableIssues.length).toBe(3);
            expect(result).toHaveFileCount(0);
            
            // Should have appropriate reasons
            result.unfixableIssues.forEach(issue => {
                expect(issue.reason).toContain('External package');
            });
        });
        
        test('should distinguish between external and internal modules with similar names', async () => {
            const project = new ProjectBuilder('similar-names-test')
                .addFile('src/App.tsx', `
import { ExternalThing } from 'some-npm-package';
import { LocalThing } from './local-package';`)
                .addIssue('TS2305', 'src/App.tsx', 2, 10, "Module 'some-npm-package' has no exported member 'ExternalThing'")
                .addIssue('TS2305', 'src/App.tsx', 3, 10, "Module './local-package' has no exported member 'LocalThing'")
                .build();
            
            const result = await fixProjectIssues(project.files, project.issues);
            
            // External should be unfixable, local should create stub
            expect(result.unfixableIssues.length).toBe(1);
            expect(result.fixedIssues.length).toBe(1);
            
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx', 'External package');
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveCreatedFile('src/local-package.tsx');
        });
    });
    
    describe('Error Handling and Edge Cases', () => {
        test('should handle file fetching failures gracefully', async () => {
            const project = new ProjectBuilder('fetching-failures')
                .addFile('src/App.tsx', `
import { Component1 } from './working';
import { Component2 } from './failing';`)
                .addIssue('TS2305', 'src/App.tsx', 2, 10, "Module './working' has no exported member 'Component1'")
                .addIssue('TS2305', 'src/App.tsx', 3, 10, "Module './failing' has no exported member 'Component2'")
                .build();
            
            const { fetcher } = createMockFileFetcher({
                'src/working.tsx': `export function ExistingFunction() {}`
            }, {
                simulateErrors: ['src/failing.tsx']
            });
            
            const result = await fixProjectIssues(project.files, project.issues, fetcher);
            
            // One should succeed, one should fail
            expect(result.fixedIssues.length).toBe(1);
            expect(result.unfixableIssues.length).toBe(1);
            
            expect(result).toHaveFixedIssue('TS2305', 'src/App.tsx');
            expect(result).toHaveUnfixableIssue('TS2305', 'src/App.tsx');
        });
        
        test('should handle malformed issues gracefully', async () => {
            const project = new ProjectBuilder('malformed-issues')
                .addFile('src/App.tsx', `import React from 'react';`)
                .build();
            
            const malformedIssues: CodeIssue[] = [
                {
                    ruleId: undefined as any,
                    filePath: 'src/App.tsx',
                    line: 1,
                    column: 1,
                    message: 'Issue without rule ID',
                    severity: 'error'
                },
                {
                    ruleId: 'INVALID_CODE',
                    filePath: 'src/App.tsx',
                    line: 1,
                    column: 1,
                    message: 'Issue with unsupported rule ID',
                    severity: 'error'
                }
            ];
            
            const result = await fixProjectIssues(project.files, malformedIssues);
            
            // Should handle gracefully without crashing
            expect(result.unfixableIssues.length).toBe(2);
            expect(result.fixedIssues.length).toBe(0);
        });
        
        test('should handle empty inputs gracefully', async () => {
            const result = await fixProjectIssues([], []);
            
            expect(result.fixedIssues.length).toBe(0);
            expect(result.unfixableIssues.length).toBe(0);
            expect(result.modifiedFiles.length).toBe(0);
        });
        
        test('should handle global error scenarios', async () => {
            // Test the global error handling in main entry point
            const project = new ProjectBuilder('global-error-test')
                .addFile('src/App.tsx', 'valid content')
                .addIssue('TS2305', 'src/App.tsx', 1, 1, 'Test issue')
                .build();
            
            // Create a fetcher that always throws
            const faultyFetcher = async () => {
                throw new Error('Global fetcher failure');
            };
            
            const result = await fixProjectIssues(project.files, project.issues, faultyFetcher);
            
            // Should not crash, should mark all issues as unfixable
            expect(result.unfixableIssues.length).toBe(1);
            expect(result.unfixableIssues[0].reason).toContain('Global fixer error');
        });
    });
    
    describe('Performance Tests', () => {
        test('should handle large projects efficiently', async () => {
            const fileCount = 50;
            const files: FileOutputType[] = [];
            const issues: CodeIssue[] = [];
            
            // Create a large project with many interconnected files
            for (let i = 0; i < fileCount; i++) {
                files.push({
                    file_path: `src/Component${i}.tsx`,
                    file_contents: `
import React from 'react';
import { Helper${i} } from './helpers/helper${i}';

export function Component${i}() {
    const result = Helper${i}();
    return <div>Component {${i}} - {result}</div>;
}`,
                    file_purpose: `Component ${i}`
                });
                
                issues.push({
                    ruleId: 'TS2307',
                    filePath: `src/Component${i}.tsx`,
                    line: 3,
                    column: 26,
                    message: `Cannot find module './helpers/helper${i}' or its corresponding type declarations.`,
                    severity: 'error'
                });
            }
            
            const { result, timeMs, withinExpected } = await measureFixerPerformance(
                () => fixProjectIssues(files, issues),
                5000 // 5 second limit
            );
            
            expect(withinExpected).toBe(true);
            expect(result.fixedIssues.length).toBe(fileCount);
            expect(result.modifiedFiles.length).toBe(fileCount);
            
            console.log(`Large project test (${fileCount} files): ${timeMs}ms`);
        });
        
        test('should maintain consistent performance across runs', async () => {
            const project = ProjectBuilder.pathResolutionProject().build();
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `export function ExistingComponent() {}`,
                'utils/helper.ts': `export function UtilFunction() {}`,
                'src/config/settings.ts': `export const ConfigValue = 'test';`
            });
            
            const runs: number[] = [];
            
            // Run the same test multiple times
            for (let i = 0; i < 5; i++) {
                const { timeMs } = await measureFixerPerformance(
                    () => fixProjectIssues(project.files, project.issues, fetcher)
                );
                runs.push(timeMs);
            }
            
            // Performance should be consistent (no major outliers)
            const avgTime = runs.reduce((a, b) => a + b) / runs.length;
            const maxDeviation = Math.max(...runs) - Math.min(...runs);
            
            expect(maxDeviation).toBeLessThan(avgTime * 2); // Max 200% variation
            console.log(`Performance consistency: avg=${avgTime.toFixed(1)}ms, deviation=${maxDeviation.toFixed(1)}ms`);
        });
    });
    
    describe('DRY Implementation Validation', () => {
        test('should use centralized utilities across all fixers', async () => {
            // Test that all fixer types use the same underlying utilities
            const mixedProject = new ProjectBuilder('mixed-issues')
                .addFile('src/App.tsx', `
import { LocalComponent } from './local';
import { ExternalThing } from 'external-package';
import MismatchDefault from './named-export-file';`)
                .addFile('src/named-export-file.tsx', `
export function MismatchDefault() {
    return <div>Should be imported as named</div>;
}`)
                .addIssue('TS2305', 'src/App.tsx', 2, 10, "Module './local' has no exported member 'LocalComponent'")
                .addIssue('TS2305', 'src/App.tsx', 3, 10, "Module 'external-package' has no exported member 'ExternalThing'")
                .addIssue('TS2613', 'src/App.tsx', 4, 8, "Module './named-export-file' has no default export")
                .build();
            
            const { fetcher } = createMockFileFetcher({
                'src/named-export-file.tsx': project.files.find(f => f.file_path === 'src/named-export-file.tsx')!.file_contents
            });
            
            const result = await fixProjectIssues(mixedProject.files, mixedProject.issues, fetcher);
            
            // Should handle different issue types consistently
            expect(result.fixedIssues.length).toBe(2); // Local file issues
            expect(result.unfixableIssues.length).toBe(1); // External package
            
            // External package should be consistently rejected
            expect(result.unfixableIssues[0].reason).toContain('External package');
            
            // Local issues should be fixed using same path resolution
            expect(result.fixedIssues.some(issue => issue.issueCode === 'TS2305')).toBe(true);
            expect(result.fixedIssues.some(issue => issue.issueCode === 'TS2613')).toBe(true);
        });
    });
});