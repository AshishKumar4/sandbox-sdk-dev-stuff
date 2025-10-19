import { unzipSync } from 'fflate';
import type { TemplateFile } from './sandboxTypes';
import { FileTreeBuilder } from './fileTreeBuilder';

/**
 * General-purpose in-memory zip extraction service
 * Uses Latin-1 encoding for lossless binary-to-string conversion
 */
export class ZipExtractor {
    /**
     * Extracts all files from a zip buffer with lossless encoding
     * 
     * Uses Latin-1 (ISO-8859-1) encoding which provides:
     * - 1-to-1 byte-to-character mapping (bytes 0-255 → chars U+0000 to U+00FF)
     * - Works for ALL file types (text, binary, Unicode, git objects, etc.)
     * - Lossless: Original bytes can be perfectly reconstructed
     * - No corruption: Every byte sequence is valid
     * 
     * @param zipBuffer - ArrayBuffer containing the zip file
     * @returns Array of extracted files with paths and Latin-1 encoded contents
     */
    static extractFiles(zipBuffer: ArrayBuffer): TemplateFile[] {
        const uint8Array = new Uint8Array(zipBuffer);
        const unzipped = unzipSync(uint8Array);
        
        const files: TemplateFile[] = [];
        
        for (const [filePath, fileData] of Object.entries(unzipped)) {
            // Skip directories
            if (filePath.endsWith('/')) {
                continue;
            }
            
            // Use Latin-1 for lossless byte-to-string conversion
            // This preserves all data exactly - text, binary, Unicode, everything
            const decoder = new TextDecoder('latin1');
            const fileContents = decoder.decode(fileData);
            
            files.push({
                filePath,
                fileContents
            });
        }
        
        return files;
    }

    /**
     * Convert Latin-1 encoded string back to Uint8Array
     * Use this when you need to write files back to sandbox or upload
     * 
     * @param content - Latin-1 encoded string from extractFiles
     * @returns Uint8Array with exact original bytes
     */
    static stringToBytes(content: string): Uint8Array {
        const encoder = new TextEncoder();
        // Latin-1: each character maps to exactly one byte
        const bytes = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) {
            bytes[i] = content.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Builds a hierarchical file tree from a flat list of file paths
     * @param files - Array of template files
     * @returns Root node of the file tree
     */
    static buildFileTree(files: TemplateFile[]) {
        return FileTreeBuilder.buildFromTemplateFiles(files, {
            rootPath: '.'
        });
    }

    /**
     * Filters files based on a list of patterns or exact paths
     * @param files - Array of all files
     * @param patterns - Array of file path patterns or exact paths
     * @returns Filtered array of files
     */
    static filterFiles(files: TemplateFile[], patterns: string[]): TemplateFile[] {
        if (patterns.length === 0) {
            return [];
        }

        return files.filter(file => {
            return patterns.some(pattern => {
                // Exact match
                if (file.filePath === pattern) {
                    return true;
                }
                
                // Pattern match (simple wildcard support)
                if (pattern.includes('*')) {
                    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    return regex.test(file.filePath);
                }
                
                return false;
            });
        });
    }

    /**
     * Finds and parses a JSON file from the extracted files
     * @param files - Array of all files
     * @param filePath - Path to the JSON file
     * @returns Parsed JSON object or null if not found
     */
    static findAndParseJson<T = any>(files: TemplateFile[], filePath: string): T | null {
        const file = files.find(f => f.filePath === filePath);
        if (!file) {
            return null;
        }

        try {
            return JSON.parse(file.fileContents) as T;
        } catch (error) {
            console.error(`Failed to parse JSON file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Extracts package.json dependencies
     * @param files - Array of all files
     * @returns Dependencies object or empty object
     */
    static extractDependencies(files: TemplateFile[]): Record<string, string> {
        const packageJson = this.findAndParseJson<{ dependencies?: Record<string, string> }>(
            files,
            'package.json'
        );
        return packageJson?.dependencies || {};
    }

    /**
     * Complete extraction with all metadata
     * @param zipBuffer - ArrayBuffer containing the zip file
     * @returns Object containing all files, file tree, and metadata
     */
    static extractComplete(zipBuffer: ArrayBuffer) {
        const files = this.extractFiles(zipBuffer);
        const fileTree = this.buildFileTree(files);
        const dependencies = this.extractDependencies(files);
        
        return {
            files,
            fileTree,
            dependencies
        };
    }
}
