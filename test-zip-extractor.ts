#!/usr/bin/env bun

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ZipExtractor } from './src/sandbox/zipExtractor';
import { FileTreeBuilder } from './src/sandbox/fileTreeBuilder';
import { unzipSync } from 'fflate';

/**
 * Comprehensive test suite for ZipExtractor
 * Validates:
 * - Extraction accuracy
 * - Round-trip integrity (extract -> decode -> identical bytes)
 * - UTF-8 and binary file handling
 * - Template details generation
 */

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
}

const results: TestResult[] = [];

function log(message: string, level: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const prefix = {
        info: '📋',
        success: '✅',
        error: '❌',
        warn: '⚠️'
    }[level];
    console.log(`${prefix} ${message}`);
}

function testRoundTripIntegrity(templateName: string, zipPath: string): TestResult {
    try {
        log(`Testing round-trip integrity for ${templateName}...`, 'info');
        
        // Read original zip
        const zipBuffer = readFileSync(zipPath);
        const originalUnzipped = unzipSync(new Uint8Array(zipBuffer));
        
        // Extract using ZipExtractor
        const extracted = ZipExtractor.extractFiles(zipBuffer.buffer);
        
        let totalFiles = 0;
        let textFiles = 0;
        let binaryFiles = 0;
        let mismatches = 0;
        const errors: string[] = [];
        
        // Verify each file
        for (const file of extracted) {
            totalFiles++;
            
            if (ZipExtractor.isBinaryContent(file.fileContents)) {
                binaryFiles++;
            } else {
                textFiles++;
            }
            
            // Get original bytes
            const originalBytes = originalUnzipped[file.filePath];
            if (!originalBytes) {
                errors.push(`File not found in original: ${file.filePath}`);
                continue;
            }
            
            // Decode back to bytes
            const decodedBytes = ZipExtractor.decodeFileContents(file.fileContents);
            
            // Compare byte-by-byte
            if (originalBytes.length !== decodedBytes.length) {
                mismatches++;
                errors.push(
                    `Size mismatch for ${file.filePath}: original=${originalBytes.length}, decoded=${decodedBytes.length}`
                );
                continue;
            }
            
            for (let i = 0; i < originalBytes.length; i++) {
                if (originalBytes[i] !== decodedBytes[i]) {
                    mismatches++;
                    errors.push(
                        `Byte mismatch at ${i} in ${file.filePath}: original=${originalBytes[i]}, decoded=${decodedBytes[i]}`
                    );
                    break;
                }
            }
        }
        
        const passed = mismatches === 0 && errors.length === 0;
        
        if (passed) {
            log(`✓ Perfect integrity: ${totalFiles} files (${textFiles} text, ${binaryFiles} binary)`, 'success');
        } else {
            log(`✗ Found ${mismatches} mismatches and ${errors.length} errors`, 'error');
            errors.slice(0, 5).forEach(err => log(`  - ${err}`, 'error'));
        }
        
        return {
            name: `Round-trip integrity: ${templateName}`,
            passed,
            error: passed ? undefined : errors.join('\n'),
            details: {
                totalFiles,
                textFiles,
                binaryFiles,
                mismatches,
                errorCount: errors.length
            }
        };
    } catch (error) {
        log(`✗ Exception: ${error instanceof Error ? error.message : error}`, 'error');
        return {
            name: `Round-trip integrity: ${templateName}`,
            passed: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function testUnicodeHandling(templateName: string, zipPath: string): TestResult {
    try {
        log(`Testing Unicode handling for ${templateName}...`, 'info');
        
        const zipBuffer = readFileSync(zipPath);
        const extracted = ZipExtractor.extractFiles(zipBuffer.buffer);
        
        // Find text files that might contain Unicode
        const textFiles = extracted.filter(f => 
            !ZipExtractor.isBinaryContent(f.fileContents) &&
            (f.filePath.endsWith('.js') || 
             f.filePath.endsWith('.ts') || 
             f.filePath.endsWith('.tsx') ||
             f.filePath.endsWith('.json'))
        );
        
        let unicodeFilesFound = 0;
        const issues: string[] = [];
        
        for (const file of textFiles) {
            // Check for common Unicode characters
            const hasUnicode = /[^\x00-\x7F]/.test(file.fileContents);
            if (hasUnicode) {
                unicodeFilesFound++;
                
                // Verify no replacement characters (corruption indicator)
                if (file.fileContents.includes('\uFFFD')) {
                    issues.push(`Replacement character found in ${file.filePath}`);
                }
                
                // Test round-trip
                const decoded = ZipExtractor.decodeFileContents(file.fileContents);
                const reEncoded = new TextDecoder('utf-8').decode(decoded);
                if (reEncoded !== file.fileContents) {
                    issues.push(`Unicode round-trip failed for ${file.filePath}`);
                }
            }
        }
        
        const passed = issues.length === 0;
        
        if (passed) {
            log(`✓ Unicode handling: ${unicodeFilesFound} files with Unicode characters`, 'success');
        } else {
            log(`✗ Unicode issues found`, 'error');
            issues.forEach(issue => log(`  - ${issue}`, 'error'));
        }
        
        return {
            name: `Unicode handling: ${templateName}`,
            passed,
            error: passed ? undefined : issues.join('\n'),
            details: { unicodeFilesFound, textFilesChecked: textFiles.length }
        };
    } catch (error) {
        return {
            name: `Unicode handling: ${templateName}`,
            passed: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function testTemplateDetails(templateName: string, zipPath: string): TestResult {
    try {
        log(`Testing template details generation for ${templateName}...`, 'info');
        
        const zipBuffer = readFileSync(zipPath);
        const allFilesArray = ZipExtractor.extractFiles(zipBuffer.buffer);
        
        // Build file tree
        const fileTree = FileTreeBuilder.buildFromTemplateFiles(allFilesArray, { rootPath: '.' });
        
        // Convert to map for efficient lookups (O(1) instead of O(n))
        const allFiles: Record<string, string> = {};
        for (const file of allFilesArray) {
            allFiles[file.filePath] = file.fileContents;
        }
        
        // Parse metadata files using efficient map lookups
        const packageJson = allFiles['package.json'] ? JSON.parse(allFiles['package.json']) : null;
        const dontTouchFiles = allFiles['.donttouch_files.json'] ? JSON.parse(allFiles['.donttouch_files.json']) : [];
        const redactedFiles = allFiles['.redacted_files.json'] ? JSON.parse(allFiles['.redacted_files.json']) : [];
        const importantFiles = allFiles['.important_files.json'] ? JSON.parse(allFiles['.important_files.json']) : [];
        
        const issues: string[] = [];
        
        // Validate package.json
        if (!packageJson) {
            issues.push('package.json not found or invalid');
        } else {
            if (!packageJson.name) issues.push('package.json missing name');
            if (!packageJson.version) issues.push('package.json missing version');
        }
        
        // Validate file tree
        if (!fileTree) {
            issues.push('Failed to build file tree');
        } else {
            if (!fileTree.children || fileTree.children.length === 0) {
                issues.push('File tree is empty');
            }
        }
        
        // Validate important files exist using efficient map lookup (O(1))
        for (const importantFile of importantFiles) {
            // Skip directory entries (ending with /)
            if (importantFile.endsWith('/')) {
                continue;
            }
            if (!allFiles[importantFile]) {
                issues.push(`Important file missing: ${importantFile}`);
            }
        }
        
        const totalFiles = Object.keys(allFiles).length;
        const passed = issues.length === 0;
        
        if (passed) {
            log(`✓ Template details valid`, 'success');
            log(`  - Files: ${totalFiles}`, 'info');
            log(`  - Package: ${packageJson?.name}@${packageJson?.version}`, 'info');
            log(`  - Important: ${importantFiles.length}`, 'info');
            log(`  - Map lookup efficiency: O(1) for ${totalFiles} files`, 'info');
        } else {
            log(`✗ Template details issues`, 'error');
            issues.forEach(issue => log(`  - ${issue}`, 'error'));
        }
        
        return {
            name: `Template details: ${templateName}`,
            passed,
            error: passed ? undefined : issues.join('\n'),
            details: {
                totalFiles,
                hasPackageJson: !!packageJson,
                importantFilesCount: importantFiles.length,
                dontTouchFilesCount: dontTouchFiles.length,
                redactedFilesCount: redactedFiles.length
            }
        };
    } catch (error) {
        return {
            name: `Template details: ${templateName}`,
            passed: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function testSpecificFileTypes(templateName: string, zipPath: string): TestResult {
    try {
        log(`Testing specific file types for ${templateName}...`, 'info');
        
        const zipBuffer = readFileSync(zipPath);
        const extracted = ZipExtractor.extractFiles(zipBuffer.buffer);
        
        const fileTypes = {
            javascript: 0,
            typescript: 0,
            json: 0,
            css: 0,
            html: 0,
            markdown: 0,
            binary: 0,
            other: 0
        };
        
        const issues: string[] = [];
        
        for (const file of extracted) {
            const isBinary = ZipExtractor.isBinaryContent(file.fileContents);
            
            if (isBinary) {
                fileTypes.binary++;
            } else if (file.filePath.endsWith('.js') || file.filePath.endsWith('.mjs')) {
                fileTypes.javascript++;
            } else if (file.filePath.endsWith('.ts') || file.filePath.endsWith('.tsx')) {
                fileTypes.typescript++;
            } else if (file.filePath.endsWith('.json')) {
                fileTypes.json++;
                // Validate JSON is parseable (skip tsconfig files which may use JSON5)
                if (!file.filePath.includes('tsconfig')) {
                    try {
                        JSON.parse(file.fileContents);
                    } catch {
                        issues.push(`Invalid JSON: ${file.filePath}`);
                    }
                }
            } else if (file.filePath.endsWith('.css')) {
                fileTypes.css++;
            } else if (file.filePath.endsWith('.html')) {
                fileTypes.html++;
            } else if (file.filePath.endsWith('.md')) {
                fileTypes.markdown++;
            } else {
                fileTypes.other++;
            }
        }
        
        const passed = issues.length === 0;
        
        if (passed) {
            log(`✓ File types valid`, 'success');
            Object.entries(fileTypes).forEach(([type, count]) => {
                if (count > 0) log(`  - ${type}: ${count}`, 'info');
            });
        } else {
            log(`✗ File type issues`, 'error');
            issues.forEach(issue => log(`  - ${issue}`, 'error'));
        }
        
        return {
            name: `File types: ${templateName}`,
            passed,
            error: passed ? undefined : issues.join('\n'),
            details: fileTypes
        };
    } catch (error) {
        return {
            name: `File types: ${templateName}`,
            passed: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Main test execution
async function runTests() {
    console.log('\n🧪 ZipExtractor Comprehensive Test Suite\n');
    console.log('='.repeat(60));
    
    const templatesDir = join(process.cwd(), 'templates', 'zips');
    const zipFiles = readdirSync(templatesDir).filter(f => f.endsWith('.zip'));
    
    if (zipFiles.length === 0) {
        log('No zip files found in templates/zips', 'error');
        process.exit(1);
    }
    
    log(`Found ${zipFiles.length} template(s) to test\n`, 'info');
    
    for (const zipFile of zipFiles) {
        const templateName = zipFile.replace('.zip', '');
        const zipPath = join(templatesDir, zipFile);
        
        console.log(`\n${'='.repeat(60)}`);
        log(`Testing: ${templateName}`, 'info');
        console.log('='.repeat(60) + '\n');
        
        // Run all tests for this template
        results.push(testRoundTripIntegrity(templateName, zipPath));
        results.push(testUnicodeHandling(templateName, zipPath));
        results.push(testTemplateDetails(templateName, zipPath));
        results.push(testSpecificFileTypes(templateName, zipPath));
        
        console.log('');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60) + '\n');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    log(`Total Tests: ${results.length}`, 'info');
    log(`Passed: ${passed}`, 'success');
    log(`Failed: ${failed}`, failed > 0 ? 'error' : 'success');
    
    if (failed > 0) {
        console.log('\n❌ Failed Tests:\n');
        results.filter(r => !r.passed).forEach(r => {
            log(r.name, 'error');
            if (r.error) {
                console.log(`   ${r.error.split('\n')[0]}`);
            }
        });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (failed === 0) {
        log('🎉 All tests passed! ZipExtractor is working perfectly!', 'success');
        process.exit(0);
    } else {
        log('💥 Some tests failed. Please review the errors above.', 'error');
        process.exit(1);
    }
}

runTests().catch(error => {
    log(`Fatal error: ${error instanceof Error ? error.message : error}`, 'error');
    process.exit(1);
});
