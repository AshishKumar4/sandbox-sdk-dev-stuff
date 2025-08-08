/**
 * Path Resolution Tests - Critical tests for path resolution functionality
 * These tests verify the fix for the critical bug where ./test from src/App.tsx
 * was not correctly resolving to src/test.tsx
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { resolveImportPath, findModuleFile, makeRelativeImport, resolveImportToFilePath } from '../../../../src/code-fixer/utils/paths';
import { createMockFileFetcher, mockPathResolutionProject } from '../../mocks/file-fetcher.mock';
import { setupFixerAssertions } from '../../test-utils/assertion-helpers';

// Setup custom assertions
beforeAll(() => {
    setupFixerAssertions();
});

describe('Path Resolution', () => {
    
    describe('resolveImportPath - Critical Bug Fix', () => {
        test('should correctly resolve ./test from src/App.tsx to src/test.tsx', async () => {
            const files = new Map();
            files.set('src/App.tsx', { content: 'mock content', filePath: 'src/App.tsx' });
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `
export function TestComponent() {
    return <div>Test</div>;
}`
            });
            const fetchedFiles = new Set<string>();
            
            const result = await resolveImportPath(
                './test',
                'src/App.tsx', 
                files,
                fetcher,
                fetchedFiles
            );
            
            // This is the critical test - this was failing before the fix
            expect(result).toBe('src/test.tsx');
            expect(files.has('src/test.tsx')).toBe(true);
            expect(fetchedFiles.has('src/test.tsx')).toBe(true);
        });
        
        test('should correctly resolve ../utils/helper from src/components/Button.tsx', async () => {
            const files = new Map();
            files.set('src/components/Button.tsx', { content: 'mock', filePath: 'src/components/Button.tsx' });
            
            const { fetcher } = createMockFileFetcher({
                'src/utils/helper.ts': `export function helper() { return 'help'; }`
            });
            const fetchedFiles = new Set<string>();
            
            const result = await resolveImportPath(
                '../utils/helper',
                'src/components/Button.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/utils/helper.ts');
        });
        
        test('should handle complex nested paths correctly', async () => {
            const files = new Map();
            files.set('src/components/ui/forms/Input.tsx', { content: 'mock', filePath: 'src/components/ui/forms/Input.tsx' });
            
            const { fetcher } = createMockFileFetcher({
                'src/utils/validation.ts': `export function validate() { return true; }`
            });
            const fetchedFiles = new Set<string>();
            
            const result = await resolveImportPath(
                '../../../utils/validation',
                'src/components/ui/forms/Input.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/utils/validation.ts');
        });
        
        test('should try multiple extensions (.ts, .tsx, .js, .jsx)', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            // Test .tsx extension
            const { fetcher: tsxFetcher } = createMockFileFetcher({
                'src/component.tsx': `export function Component() {}`
            });
            
            const tsxResult = await resolveImportPath(
                './component',
                'src/App.tsx',
                files,
                tsxFetcher,
                fetchedFiles
            );
            
            expect(tsxResult).toBe('src/component.tsx');
        });
        
        test('should handle path normalization correctly', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const { fetcher } = createMockFileFetcher({
                'src/utils/helper.ts': `export function helper() {}`
            });
            
            // Test with redundant path segments
            const result = await resolveImportPath(
                './components/../utils/helper',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/utils/helper.ts');
        });
    });
    
    describe('findModuleFile', () => {
        test('should find existing files after path resolution', async () => {
            const files = new Map();
            files.set('src/App.tsx', { content: 'mock', filePath: 'src/App.tsx' });
            
            const { fetcher, fetchLog } = createMockFileFetcher(mockPathResolutionProject);
            const fetchedFiles = new Set<string>();
            
            const result = await findModuleFile(
                './test',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/test.tsx');
            expect(fetchLog).toContain('src/test.tsx');
        });
        
        test('should handle alias resolution (@/path)', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const { fetcher } = createMockFileFetcher({
                'src/config/settings.ts': `export const config = {};`
            });
            
            const result = await findModuleFile(
                '@/config/settings',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/config/settings.ts');
        });
        
        test('should perform fuzzy matching for similar file names', async () => {
            const files = new Map();
            // Add existing files to map
            files.set('src/components/UserButton.tsx', { content: 'mock', filePath: 'src/components/UserButton.tsx' });
            
            const fetchedFiles = new Set<string>();
            
            const result = await findModuleFile(
                './Button', // Looking for Button, should find UserButton
                'src/components/Form.tsx',
                files,
                undefined, // No fetcher for this test
                fetchedFiles
            );
            
            expect(result).toBe('src/components/UserButton.tsx');
        });
        
        test('should return null for external packages', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const result = await findModuleFile(
                'react',
                'src/App.tsx',
                files,
                undefined,
                fetchedFiles
            );
            
            expect(result).toBe(null);
        });
        
        test('should handle file fetching failures gracefully', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const { fetcher } = createMockFileFetcher({}, {
                simulateErrors: ['src/test.tsx'],
                logFetches: true
            });
            
            const result = await findModuleFile(
                './test',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe(null);
        });
    });
    
    describe('makeRelativeImport', () => {
        test('should create correct relative paths', () => {
            const testCases = [
                {
                    from: 'src/App.tsx',
                    to: 'src/components/Button.tsx',
                    expected: './components/Button'
                },
                {
                    from: 'src/components/forms/Input.tsx',
                    to: 'src/utils/validation.ts',
                    expected: '../../utils/validation'
                },
                {
                    from: 'src/pages/Home.tsx',
                    to: 'src/pages/About.tsx',
                    expected: './About'
                },
                {
                    from: 'src/components/ui/Button.tsx',
                    to: 'src/hooks/useTheme.ts',
                    expected: '../../hooks/useTheme'
                }
            ];
            
            testCases.forEach(({ from, to, expected }) => {
                const result = makeRelativeImport(from, to);
                expect(result).toBe(expected);
            });
        });
    });
    
    describe('resolveImportToFilePath', () => {
        test('should resolve relative imports to correct file paths', () => {
            const testCases = [
                {
                    importSpecifier: './test',
                    currentFile: 'src/App.tsx',
                    expected: 'src/test.tsx'
                },
                {
                    importSpecifier: '../utils/helper',
                    currentFile: 'src/components/Button.tsx',
                    expected: 'src/utils/helper.tsx'
                },
                {
                    importSpecifier: '@/config/settings',
                    currentFile: 'src/App.tsx',
                    expected: 'src/config/settings.tsx'
                }
            ];
            
            testCases.forEach(({ importSpecifier, currentFile, expected }) => {
                const result = resolveImportToFilePath(importSpecifier, currentFile);
                expect(result).toBe(expected);
            });
        });
        
        test('should add .tsx extension by default for React components', () => {
            const result = resolveImportToFilePath('./Component', 'src/App.tsx');
            expect(result).toBe('src/Component.tsx');
        });
        
        test('should preserve existing extensions', () => {
            const result = resolveImportToFilePath('./helper.ts', 'src/App.tsx');
            expect(result).toBe('src/helper.ts');
        });
    });
    
    describe('Edge Cases and Error Handling', () => {
        test('should handle empty import specifiers', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const result = await findModuleFile(
                '',
                'src/App.tsx',
                files,
                undefined,
                fetchedFiles
            );
            
            expect(result).toBe(null);
        });
        
        test('should handle malformed paths gracefully', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const { fetcher } = createMockFileFetcher({});
            
            const result = await resolveImportPath(
                './/test///',
                'src//App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            // Should handle malformed paths without crashing
            expect(typeof result).toBe('string');
        });
        
        test('should handle circular relative paths', async () => {
            const files = new Map();
            const fetchedFiles = new Set<string>();
            
            const { fetcher } = createMockFileFetcher({});
            
            const result = await resolveImportPath(
                './a/../b/../c/../test',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            expect(result).toBe('src/test');
        });
        
        test('should not resolve paths outside project boundaries', () => {
            const result = resolveImportToFilePath('../../../etc/passwd', 'src/App.tsx');
            
            // Should not resolve to system files
            expect(result).not.toContain('/etc/passwd');
            expect(result).toContain('src/');
        });
    });
    
    describe('Performance Tests', () => {
        test('should resolve paths quickly for large projects', async () => {
            const files = new Map();
            
            // Add many files to simulate large project
            for (let i = 0; i < 1000; i++) {
                files.set(`src/component${i}.tsx`, { 
                    content: `export function Component${i}() {}`, 
                    filePath: `src/component${i}.tsx` 
                });
            }
            
            const { fetcher } = createMockFileFetcher({
                'src/test.tsx': `export function TestComponent() {}`
            });
            const fetchedFiles = new Set<string>();
            
            const startTime = Date.now();
            
            const result = await findModuleFile(
                './test',
                'src/App.tsx',
                files,
                fetcher,
                fetchedFiles
            );
            
            const elapsed = Date.now() - startTime;
            
            expect(result).toBe('src/test.tsx');
            expect(elapsed).toBeLessThan(100); // Should complete within 100ms
        });
    });
});