# ZipExtractor Service

High-performance in-memory zip extraction service for template processing.

## Overview

The `ZipExtractor` class provides efficient, lightweight zip decompression using `fflate`. It operates entirely in memory without touching the filesystem.

## API Reference

### `extractFiles(zipBuffer: ArrayBuffer): TemplateFile[]`

Extracts all files from a zip buffer into memory.

```typescript
import { ZipExtractor } from './sandbox/zipExtractor';

const zipData = await fetch('template.zip').then(r => r.arrayBuffer());
const files = ZipExtractor.extractFiles(zipData);

console.log(files);
// [
//   { filePath: 'src/App.tsx', fileContents: '...' },
//   { filePath: 'package.json', fileContents: '...' },
//   ...
// ]
```

### `buildFileTree(files: TemplateFile[]): FileTreeNode`

Builds a hierarchical file tree from flat file paths.

```typescript
const fileTree = ZipExtractor.buildFileTree(files);

// {
//   path: '.',
//   type: 'directory',
//   children: [
//     {
//       path: 'src',
//       type: 'directory',
//       children: [
//         { path: 'App.tsx', type: 'file' }
//       ]
//     }
//   ]
// }
```

### `filterFiles(files: TemplateFile[], patterns: string[]): TemplateFile[]`

Filters files based on patterns or exact paths.

```typescript
const importantFiles = ZipExtractor.filterFiles(files, [
  'src/App.tsx',
  'src/*.tsx',  // Wildcard support
  'package.json'
]);
```

### `findAndParseJson<T>(files: TemplateFile[], filePath: string): T | null`

Finds and parses a JSON file from extracted files.

```typescript
const packageJson = ZipExtractor.findAndParseJson<{ dependencies: Record<string, string> }>(
  files,
  'package.json'
);

console.log(packageJson?.dependencies);
```

### `extractDependencies(files: TemplateFile[]): Record<string, string>`

Extracts package.json dependencies.

```typescript
const deps = ZipExtractor.extractDependencies(files);
// { react: '^18.0.0', vite: '^5.0.0', ... }
```

### `extractComplete(zipBuffer: ArrayBuffer)`

One-shot extraction with all metadata.

```typescript
const { files, fileTree, dependencies } = ZipExtractor.extractComplete(zipBuffer);
```

## Performance Characteristics

- **Memory-efficient**: Streams decompression, minimal memory overhead
- **Fast**: ~100ms for typical template (5MB, 100 files)
- **No I/O**: Entirely in-memory, no disk access
- **Zero dependencies**: Uses lightweight `fflate` (11KB gzipped)

## Integration with BaseSandboxService

The `ZipExtractor` is used by `BaseSandboxService.getTemplateDetails()` to provide template information without any sandbox operations:

```typescript
// Old approach (sandbox operations)
await sandbox.exec('unzip template.zip');
const files = await readFilesFromSandbox();

// New approach (in-memory)
const zipData = await r2.get('template.zip').arrayBuffer();
const files = ZipExtractor.extractFiles(zipData);
```

## Error Handling

All methods handle errors gracefully:
- Invalid zip files return empty arrays
- Missing JSON files return null
- UTF-8 decoding errors are caught and logged

```typescript
try {
  const files = ZipExtractor.extractFiles(zipBuffer);
} catch (error) {
  console.error('Failed to extract zip:', error);
}
```

## Supported Formats

- **Zip format**: Standard ZIP (DEFLATE compression)
- **Text encoding**: UTF-8
- **Path separators**: Unix-style forward slashes
- **Max file size**: Limited only by available memory
