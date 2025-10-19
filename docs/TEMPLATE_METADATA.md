# Template Metadata Files

Templates can include special metadata files that control file visibility and behavior in the AI vibecoding platform.

## Metadata Files

### `.important_files.json`
Lists files that should be highlighted as important in the AI interface. These are typically the files users will interact with most frequently.

**Format:**
```json
[
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "package.json",
  "wrangler.jsonc"
]
```

### `.donttouch_files.json`
Lists files that should be protected from AI modifications. These files are read-only in the AI interface.

**Format:**
```json
[
  "package-lock.json",
  "bun.lockb",
  ".gitignore",
  "node_modules/**"
]
```

### `.redacted_files.json`
Lists files whose contents should be hidden from the AI. These files exist but their content is not shown.

**Format:**
```json
[
  ".env",
  ".dev.vars",
  "wrangler.jsonc"
]
```

## Template Details API Response

The `GET /templates/:name` endpoint returns:

```typescript
{
  success: true,
  templateDetails: {
    name: "template-name",
    description: {
      selection: "Short description",
      usage: "Detailed usage instructions"
    },
    fileTree: { /* Hierarchical file structure */ },
    allFiles: [
      { filePath: "src/App.tsx", fileContents: "..." },
      // All template files
    ],
    importantFiles: [
      "src/App.tsx",
      "src/main.tsx"
    ],
    dontTouchFiles: ["package-lock.json"],
    redactedFiles: [".env"],
    language: "typescript",
    deps: { /* package.json dependencies */ },
    frameworks: ["react", "vite"]
  }
}
```

## In-Memory Processing

Template details are now retrieved entirely in-memory:
1. Zip file is downloaded from R2 bucket
2. Files are extracted in-memory using `fflate`
3. Metadata is parsed from JSON files
4. All files are returned without any sandbox operations

This provides:
- ✅ **Fast response times** - No sandbox I/O operations
- ✅ **Reduced load** - No temporary files created
- ✅ **Complete file access** - AI has access to all files upfront
- ✅ **Efficient updates** - AI can write only changed files back

## Best Practices

1. **Important Files**: Include 5-10 key files that users typically modify
2. **Don't Touch**: Include lock files, generated files, and build artifacts
3. **Redacted**: Include sensitive configuration files
4. **Keep Metadata Small**: Metadata files should be under 5KB each
