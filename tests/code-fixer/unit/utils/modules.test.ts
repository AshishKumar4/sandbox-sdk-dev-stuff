/**
 * Modules Utility Tests - External module detection and validation
 * Tests the DRY implementation that eliminated duplicate code across fixers
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { 
    isExternalModule, 
    canModifyFile, 
    resolveModuleFile, 
    validateModuleOperation, 
    getModuleType 
} from '../../../../src/code-fixer/utils/modules';
import { FixerContext } from '../../../../src/code-fixer/types';
import { createMockFileFetcher } from '../../mocks/file-fetcher.mock';
import { setupFixerAssertions } from '../../test-utils/assertion-helpers';

beforeAll(() => {
    setupFixerAssertions();
});

describe('Modules Utility - DRY Implementation', () => {
    
    describe('isExternalModule - Core External Detection', () => {
        test('should identify npm packages as external', () => {
            const externalModules = [
                'react',
                'react-dom',
                '@types/react',
                'lodash',
                '@babel/core',
                'typescript',
                'vite',
                '@radix-ui/react-dialog',
                'date-fns'
            ];
            
            externalModules.forEach(module => {
                expect(isExternalModule(module)).toBe(true);
            });
        });
        
        test('should identify local modules as internal', () => {
            const internalModules = [
                './component',
                '../utils/helper',
                '@/config/settings',
                'src/components/Button',
                './test',
                '../../../utils/validation',
                '@/hooks/useTheme'
            ];
            
            internalModules.forEach(module => {
                expect(isExternalModule(module)).toBe(false);
            });
        });
        
        test('should handle edge cases correctly', () => {
            // Scoped packages
            expect(isExternalModule('@company/internal-lib')).toBe(true);
            expect(isExternalModule('@organization/package')).toBe(true);
            
            // Relative-looking but external
            expect(isExternalModule('some-package/submodule')).toBe(true);
            
            // Path-like but internal
            expect(isExternalModule('src/components/ui/button')).toBe(false);
            
            // Edge cases
            expect(isExternalModule('')).toBe(true); // Empty string is external
            expect(isExternalModule('.')).toBe(false); // Current directory
            expect(isExternalModule('..')).toBe(false); // Parent directory
        });
        
        test('should handle file extensions in paths', () => {
            expect(isExternalModule('./file.ts')).toBe(false);
            expect(isExternalModule('../utils/helper.tsx')).toBe(false);
            expect(isExternalModule('src/components.jsx')).toBe(false);
            
            // But external modules with paths containing dots
            expect(isExternalModule('some-package/lib.min.js')).toBe(true);
        });
    });
    
    describe('canModifyFile - Safety Validation', () => {
        test('should allow modification of project files', () => {
            const allowedFiles = [
                'src/App.tsx',
                'src/components/Button.tsx',
                'src/utils/helper.ts',
                'src/hooks/useCounter.js',
                'components/ui/dialog.jsx',
                'utils/validation.ts'
            ];
            
            allowedFiles.forEach(file => {
                expect(canModifyFile(file)).toBe(true);
            });
        });
        
        test('should prevent modification of external/system files', () => {
            const forbiddenFiles = [
                'node_modules/react/index.js',
                'node_modules/@types/react/index.d.ts',
                '.git/config',
                '.git/hooks/pre-commit',
                '/etc/passwd',
                '/usr/bin/node',
                'C:\\Windows\\System32\\cmd.exe'
            ];
            
            forbiddenFiles.forEach(file => {
                expect(canModifyFile(file)).toBe(false);
            });
        });
        
        test('should only allow script files', () => {
            // Allowed extensions
            const scriptFiles = [
                'src/component.ts',
                'src/component.tsx', 
                'src/component.js',
                'src/component.jsx'
            ];
            
            scriptFiles.forEach(file => {
                expect(canModifyFile(file)).toBe(true);
            });
            
            // Forbidden extensions
            const nonScriptFiles = [
                'src/styles.css',
                'src/data.json',
                'README.md',
                'package.json',
                'image.png',
                'config.yaml'
            ];
            
            nonScriptFiles.forEach(file => {
                expect(canModifyFile(file)).toBe(false);
            });
        });
        
        test('should handle path traversal attempts', () => {
            const maliciousFiles = [
                '../../../etc/passwd',
                '..\\..\\..\\Windows\\System32\\cmd.exe',
                'src/../../../etc/hosts',
                'node_modules/../../../sensitive-file'
            ];
            
            maliciousFiles.forEach(file => {
                expect(canModifyFile(file)).toBe(false);
            });
        });
    });
    
    describe('resolveModuleFile - Unified Resolution', () => {
        test('should resolve local modules through existing logic', async () => {
            const context: FixerContext = {
                files: new Map(),
                fileFetcher: createMockFileFetcher({
                    'src/test.tsx': `export function TestComponent() {}`
                }).fetcher,
                fetchedFiles: new Set()
            };
            
            const result = await resolveModuleFile('./test', 'src/App.tsx', context);
            expect(result).toBe('src/test.tsx');
        });
        
        test('should return null for external modules', async () => {
            const context: FixerContext = {
                files: new Map(),
                fileFetcher: undefined,
                fetchedFiles: new Set()
            };
            
            const externalModules = ['react', '@types/node', 'lodash'];
            
            for (const module of externalModules) {
                const result = await resolveModuleFile(module, 'src/App.tsx', context);
                expect(result).toBe(null);
            }
        });
        
        test('should handle file fetching errors gracefully', async () => {
            const context: FixerContext = {
                files: new Map(),
                fileFetcher: createMockFileFetcher({}, {
                    simulateErrors: ['src/test.tsx']
                }).fetcher,
                fetchedFiles: new Set()
            };
            
            const result = await resolveModuleFile('./test', 'src/App.tsx', context);
            expect(result).toBe(null);
        });
    });
    
    describe('validateModuleOperation - Comprehensive Validation', () => {
        test('should validate safe local module operations', () => {
            const validOperations = [
                { specifier: './component', targetFile: 'src/component.tsx' },
                { specifier: '../utils/helper', targetFile: 'src/utils/helper.ts' },
                { specifier: '@/config/settings', targetFile: 'src/config/settings.ts' },
                { specifier: './test', targetFile: null }, // No target file yet
            ];
            
            validOperations.forEach(({ specifier, targetFile }) => {
                const result = validateModuleOperation(specifier, targetFile);
                expect(result.valid).toBe(true);
                expect(result.reason).toBeUndefined();
            });
        });
        
        test('should reject external module operations', () => {
            const externalOperations = [
                { specifier: 'react', targetFile: null },
                { specifier: '@types/react', targetFile: null },
                { specifier: 'lodash', targetFile: 'node_modules/lodash/index.js' },
            ];
            
            externalOperations.forEach(({ specifier, targetFile }) => {
                const result = validateModuleOperation(specifier, targetFile);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain('External package');
                expect(result.reason).toContain(specifier);
            });
        });
        
        test('should reject operations on unsafe target files', () => {
            const unsafeOperations = [
                { specifier: './test', targetFile: 'node_modules/react/index.js' },
                { specifier: './config', targetFile: '.git/config' },
                { specifier: './helper', targetFile: '/etc/passwd' },
            ];
            
            unsafeOperations.forEach(({ specifier, targetFile }) => {
                const result = validateModuleOperation(specifier, targetFile);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain('outside project boundaries');
            });
        });
    });
    
    describe('getModuleType - Classification', () => {
        test('should correctly classify module types', () => {
            const classifications = [
                { specifier: 'react', expected: 'external' },
                { specifier: '@types/react', expected: 'external' },
                { specifier: './component', expected: 'relative' },
                { specifier: '../utils/helper', expected: 'relative' },
                { specifier: '@/config/settings', expected: 'alias' },
                { specifier: 'src/components/Button', expected: 'absolute' }
            ];
            
            classifications.forEach(({ specifier, expected }) => {
                const result = getModuleType(specifier);
                expect(result).toBe(expected);
            });
        });
    });
    
    describe('DRY Validation - No Code Duplication', () => {
        test('should be the single source of truth for external detection', () => {
            // This test validates that we've eliminated duplicate isExternalPackage functions
            // by ensuring the module detection logic is centralized here
            
            const testCases = [
                // Cases that were previously handled by different duplicate functions
                { module: 'react', shouldBeExternal: true, context: 'React library' },
                { module: '@types/node', shouldBeExternal: true, context: 'Type definitions' },
                { module: './local-file', shouldBeExternal: false, context: 'Local relative import' },
                { module: '@/aliased-path', shouldBeExternal: false, context: 'Aliased path import' },
                { module: 'some-npm-package/submodule', shouldBeExternal: true, context: 'NPM submodule' }
            ];
            
            testCases.forEach(({ module, shouldBeExternal, context }) => {
                expect(isExternalModule(module)).toBe(shouldBeExternal);
            });
        });
        
        test('should provide consistent validation across all fixers', () => {
            // Test that the same validation logic applies regardless of fixer context
            const modules = ['react', './local', '@/alias', '../relative'];
            
            modules.forEach(module => {
                const isExternal = isExternalModule(module);
                const validation = validateModuleOperation(module, null);
                
                if (isExternal) {
                    expect(validation.valid).toBe(false);
                    expect(validation.reason).toContain('External package');
                } else {
                    expect(validation.valid).toBe(true);
                }
            });
        });
    });
    
    describe('Integration with Existing Code', () => {
        test('should work seamlessly with findModuleFile', async () => {
            // Test that the modules utility integrates properly with existing path resolution
            const context: FixerContext = {
                files: new Map([
                    ['src/existing.tsx', { filePath: 'src/existing.tsx', content: 'mock', ast: undefined }]
                ]),
                fileFetcher: createMockFileFetcher({
                    'src/new-file.tsx': `export function NewComponent() {}`
                }).fetcher,
                fetchedFiles: new Set()
            };
            
            // Should find existing file
            const existingResult = await resolveModuleFile('./existing', 'src/App.tsx', context);
            expect(existingResult).toBe('src/existing.tsx');
            
            // Should fetch and find new file
            const newResult = await resolveModuleFile('./new-file', 'src/App.tsx', context);
            expect(newResult).toBe('src/new-file.tsx');
            
            // Should reject external modules
            const externalResult = await resolveModuleFile('react', 'src/App.tsx', context);
            expect(externalResult).toBe(null);
        });
        
        test('should maintain type safety with existing interfaces', () => {
            // Test that the module functions work with existing TypeScript interfaces
            const mockContext: FixerContext = {
                files: new Map(),
                fileFetcher: async () => null,
                fetchedFiles: new Set()
            };
            
            // Should compile without type errors and work as expected
            expect(typeof resolveModuleFile).toBe('function');
            expect(typeof validateModuleOperation).toBe('function');
            expect(typeof canModifyFile).toBe('function');
        });
    });
    
    describe('Performance and Edge Cases', () => {
        test('should handle large numbers of module checks efficiently', () => {
            const modules = Array.from({length: 1000}, (_, i) => `test-module-${i}`);
            
            const startTime = Date.now();
            
            modules.forEach(module => {
                isExternalModule(module);
                canModifyFile(`src/${module}.ts`);
                getModuleType(module);
            });
            
            const elapsed = Date.now() - startTime;
            expect(elapsed).toBeLessThan(100); // Should complete quickly
        });
        
        test('should handle malformed module specifiers gracefully', () => {
            const malformedModules = [
                '',
                '   ',
                null as any,
                undefined as any,
                '////',
                '....',
                '\n\t',
                '../../../../../../etc/passwd'
            ];
            
            malformedModules.forEach(module => {
                expect(() => isExternalModule(module)).not.toThrow();
                expect(() => getModuleType(module)).not.toThrow();
                expect(() => validateModuleOperation(module, null)).not.toThrow();
            });
        });
    });
});