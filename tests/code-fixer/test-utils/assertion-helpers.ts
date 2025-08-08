/**
 * Assertion Helpers - Custom assertions for code fixer testing
 */

import { CodeFixResult, FixedIssue, UnfixableIssue } from '../../../src/code-fixer/types';
import { FileOutputType } from '../../../src/schemas';

// ============================================================================
// CUSTOM ASSERTION INTERFACES
// ============================================================================

interface FixerAssertions {
    toHaveFixedIssue(issueCode: string, filePath: string, expectedFix?: string): void;
    toHaveUnfixableIssue(issueCode: string, filePath: string, expectedReason?: string): void;
    toHaveCreatedFile(filePath: string, expectedContent?: string): void;
    toHaveModifiedFile(filePath: string, expectedChanges?: string[]): void;
    toHaveFileCount(expectedCount: number): void;
    toHaveNoErrors(): void;
    toHaveSuccessRate(expectedRate: number): void;
}

declare global {
    namespace jest {
        interface Matchers<R> extends FixerAssertions {}
    }
}

// ============================================================================
// ASSERTION IMPLEMENTATIONS
// ============================================================================

export function setupFixerAssertions() {
    // Extend expect with custom matchers
    expect.extend({
        toHaveFixedIssue(received: CodeFixResult, issueCode: string, filePath: string, expectedFix?: string) {
            const fixedIssue = received.fixedIssues.find(
                issue => issue.issueCode === issueCode && issue.filePath === filePath
            );

            if (!fixedIssue) {
                return {
                    message: () => 
                        `Expected to find fixed issue ${issueCode} in ${filePath}\n` +
                        `Fixed issues: ${received.fixedIssues.map(i => `${i.issueCode}@${i.filePath}`).join(', ')}`,
                    pass: false
                };
            }

            if (expectedFix && !fixedIssue.fixApplied.includes(expectedFix)) {
                return {
                    message: () => 
                        `Expected fix to contain "${expectedFix}"\n` +
                        `Actual fix: ${fixedIssue.fixApplied}`,
                    pass: false
                };
            }

            return {
                message: () => `Expected NOT to find fixed issue ${issueCode} in ${filePath}`,
                pass: true
            };
        },

        toHaveUnfixableIssue(received: CodeFixResult, issueCode: string, filePath: string, expectedReason?: string) {
            const unfixableIssue = received.unfixableIssues.find(
                issue => issue.issueCode === issueCode && issue.filePath === filePath
            );

            if (!unfixableIssue) {
                return {
                    message: () => 
                        `Expected to find unfixable issue ${issueCode} in ${filePath}\n` +
                        `Unfixable issues: ${received.unfixableIssues.map(i => `${i.issueCode}@${i.filePath}`).join(', ')}`,
                    pass: false
                };
            }

            if (expectedReason && !unfixableIssue.reason.includes(expectedReason)) {
                return {
                    message: () => 
                        `Expected reason to contain "${expectedReason}"\n` +
                        `Actual reason: ${unfixableIssue.reason}`,
                    pass: false
                };
            }

            return {
                message: () => `Expected NOT to find unfixable issue ${issueCode} in ${filePath}`,
                pass: true
            };
        },

        toHaveCreatedFile(received: CodeFixResult, filePath: string, expectedContent?: string) {
            const createdFile = received.modifiedFiles.find(file => file.file_path === filePath);
            
            if (!createdFile) {
                return {
                    message: () => 
                        `Expected to find created/modified file ${filePath}\n` +
                        `Created files: ${received.modifiedFiles.map(f => f.file_path).join(', ')}`,
                    pass: false
                };
            }

            if (expectedContent && !createdFile.file_contents.includes(expectedContent)) {
                return {
                    message: () => 
                        `Expected file content to contain "${expectedContent}"\n` +
                        `Actual content: ${createdFile.file_contents.substring(0, 200)}...`,
                    pass: false
                };
            }

            return {
                message: () => `Expected NOT to find created file ${filePath}`,
                pass: true
            };
        },

        toHaveModifiedFile(received: CodeFixResult, filePath: string, expectedChanges?: string[]) {
            const modifiedFile = received.modifiedFiles.find(file => file.file_path === filePath);
            
            if (!modifiedFile) {
                return {
                    message: () => 
                        `Expected to find modified file ${filePath}\n` +
                        `Modified files: ${received.modifiedFiles.map(f => f.file_path).join(', ')}`,
                    pass: false
                };
            }

            if (expectedChanges) {
                const content = modifiedFile.file_contents;
                const missingChanges = expectedChanges.filter(change => !content.includes(change));
                
                if (missingChanges.length > 0) {
                    return {
                        message: () => 
                            `Expected file to contain changes: ${missingChanges.join(', ')}\n` +
                            `File content: ${content.substring(0, 300)}...`,
                        pass: false
                    };
                }
            }

            return {
                message: () => `Expected NOT to find modified file ${filePath}`,
                pass: true
            };
        },

        toHaveFileCount(received: CodeFixResult, expectedCount: number) {
            const actualCount = received.modifiedFiles.length;
            
            if (actualCount !== expectedCount) {
                return {
                    message: () => 
                        `Expected ${expectedCount} modified files, got ${actualCount}\n` +
                        `Files: ${received.modifiedFiles.map(f => f.file_path).join(', ')}`,
                    pass: false
                };
            }

            return {
                message: () => `Expected NOT to have ${expectedCount} modified files`,
                pass: true
            };
        },

        toHaveNoErrors(received: CodeFixResult) {
            if (received.unfixableIssues.length > 0) {
                return {
                    message: () => 
                        `Expected no unfixable issues, but found ${received.unfixableIssues.length}:\n` +
                        received.unfixableIssues.map(issue => 
                            `${issue.issueCode}@${issue.filePath}: ${issue.reason}`
                        ).join('\n'),
                    pass: false
                };
            }

            return {
                message: () => `Expected to have unfixable issues`,
                pass: true
            };
        },

        toHaveSuccessRate(received: CodeFixResult, expectedRate: number) {
            const totalIssues = received.fixedIssues.length + received.unfixableIssues.length;
            const actualRate = totalIssues === 0 ? 1 : received.fixedIssues.length / totalIssues;
            
            if (Math.abs(actualRate - expectedRate) > 0.01) { // Allow 1% tolerance
                return {
                    message: () => 
                        `Expected success rate of ${expectedRate}, got ${actualRate.toFixed(2)}\n` +
                        `Fixed: ${received.fixedIssues.length}, Unfixable: ${received.unfixableIssues.length}`,
                    pass: false
                };
            }

            return {
                message: () => `Expected NOT to have success rate of ${expectedRate}`,
                pass: true
            };
        }
    });
}

// ============================================================================
// HELPER FUNCTIONS FOR TESTING
// ============================================================================

/**
 * Extract file content from result by path
 */
export function getFileContent(result: CodeFixResult, filePath: string): string | null {
    const file = result.modifiedFiles.find(f => f.file_path === filePath);
    return file ? file.file_contents : null;
}

/**
 * Get all fixed issue codes
 */
export function getFixedIssueCodes(result: CodeFixResult): string[] {
    return result.fixedIssues.map(issue => issue.issueCode);
}

/**
 * Get all unfixable issue codes
 */
export function getUnfixableIssueCodes(result: CodeFixResult): string[] {
    return result.unfixableIssues.map(issue => issue.issueCode);
}

/**
 * Check if a specific export was added to a file
 */
export function hasExportAdded(result: CodeFixResult, filePath: string, exportName: string): boolean {
    const content = getFileContent(result, filePath);
    if (!content) return false;
    
    // Check for various export patterns
    const exportPatterns = [
        `export function ${exportName}`,
        `export const ${exportName}`,
        `export class ${exportName}`,
        `export { ${exportName} }`,
        `export default ${exportName}`
    ];
    
    return exportPatterns.some(pattern => content.includes(pattern));
}

/**
 * Check if an import statement was fixed
 */
export function hasImportFixed(result: CodeFixResult, filePath: string, importPattern: string): boolean {
    const content = getFileContent(result, filePath);
    if (!content) return false;
    
    return content.includes(importPattern);
}

/**
 * Validate that no external modules were modified
 */
export function validateNoExternalModifications(result: CodeFixResult): boolean {
    const externalPatterns = [
        'node_modules/',
        '@types/',
        'react',
        'lodash',
        '@babel/'
    ];
    
    return !result.modifiedFiles.some(file => 
        externalPatterns.some(pattern => file.file_path.includes(pattern))
    );
}

/**
 * Check DRY compliance - no duplicate code in output
 */
export function validateDRYCompliance(result: CodeFixResult): { compliant: boolean; issues: string[] } {
    const issues: string[] = [];
    const allContent = result.modifiedFiles.map(f => f.file_contents).join('\n');
    
    // Common patterns that suggest duplication
    const duplicatePatterns = [
        /isExternalPackage.*isExternalPackage/s,
        /canFixTS\d+.*canFixTS\d+/s,
        /handleFixerError.*handleFixerError/s
    ];
    
    duplicatePatterns.forEach((pattern, index) => {
        if (pattern.test(allContent)) {
            issues.push(`Potential duplication found (pattern ${index + 1})`);
        }
    });
    
    return {
        compliant: issues.length === 0,
        issues
    };
}

// ============================================================================
// PERFORMANCE TESTING HELPERS
// ============================================================================

/**
 * Measure execution time of a fixer operation
 */
export async function measureFixerPerformance<T>(
    operation: () => Promise<T>,
    expectedMaxTimeMs: number = 5000
): Promise<{ result: T; timeMs: number; withinExpected: boolean }> {
    const startTime = Date.now();
    const result = await operation();
    const timeMs = Date.now() - startTime;
    
    return {
        result,
        timeMs,
        withinExpected: timeMs <= expectedMaxTimeMs
    };
}

/**
 * Create a large test project for performance testing
 */
export function createLargeProject(fileCount: number = 100): {files: FileOutputType[]; issues: any[]} {
    const files: FileOutputType[] = [];
    const issues: any[] = [];
    
    // Create main app file
    files.push({
        file_path: 'src/App.tsx',
        file_contents: `
import React from 'react';
${Array.from({length: Math.min(fileCount, 50)}, (_, i) => 
    `import { Component${i} } from './components/Component${i}';`
).join('\n')}

export default function App() {
    return (
        <div>
            ${Array.from({length: Math.min(fileCount, 50)}, (_, i) => 
                `<Component${i} key={${i}} />`
            ).join('\n            ')}
        </div>
    );
}`,
        file_purpose: 'Main application component'
    });
    
    // Create component files with issues
    for (let i = 0; i < Math.min(fileCount - 1, 99); i++) {
        files.push({
            file_path: `src/components/Component${i}.tsx`,
            file_contents: `
import React from 'react';
import { HelperFunction${i} } from './helpers/helper${i}';
import { MissingExport${i} } from './missing/module${i}';

export function Component${i}() {
    const result = HelperFunction${i}();
    return (
        <div>
            <h1>Component {${i}}</h1>
            <MissingExport${i} />
            {result}
        </div>
    );
}`,
            file_purpose: `Component ${i}`
        });
        
        // Add various types of issues
        const issueTypes = ['TS2307', 'TS2305', 'TS2304'];
        const issueType = issueTypes[i % issueTypes.length];
        
        issues.push({
            ruleId: issueType,
            filePath: `src/components/Component${i}.tsx`,
            line: 3,
            column: 26,
            message: `Cannot find module './helpers/helper${i}' or its corresponding type declarations.`,
            severity: 'error'
        });
    }
    
    return { files, issues };
}