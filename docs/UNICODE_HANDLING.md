# Unicode and Text Encoding Handling

## Overview

The ZipExtractor service handles text encoding for template files. This document explains the encoding strategy and limitations.

## Text Encoding Strategy

### UTF-8 Only
All files in templates are decoded as **UTF-8** text. This is suitable for:
- ✅ JavaScript/TypeScript source code
- ✅ JSON configuration files
- ✅ HTML templates
- ✅ CSS/SCSS stylesheets
- ✅ Markdown documentation
- ✅ YAML/TOML configs
- ✅ Plain text files

### Why UTF-8?
1. **Universal Standard**: UTF-8 is the de facto standard for web development
2. **Backward Compatible**: ASCII files are valid UTF-8
3. **Complete Unicode**: Supports all Unicode characters
4. **Tooling Support**: Modern editors default to UTF-8

## Binary File Handling

### Excluded File Types
Binary files are **automatically skipped** if they contain invalid UTF-8 sequences:

```typescript
// These files will be skipped during extraction
- Images: .png, .jpg, .gif, .ico, .webp
- Fonts: .woff, .woff2, .ttf, .otf
- Archives: .zip, .tar, .gz
- Documents: .pdf
- Executables: .exe, .dll, .so
```

### Template Best Practices

**For Binary Assets:**
```json
// .redacted_files.json
[
  "public/logo.png",
  "public/fonts/*",
  "*.pdf"
]
```

Binary files should be:
1. Listed in `.redacted_files.json` (excluded from AI context)
2. Listed in `.donttouch_files.json` (protected from modification)
3. Ideally, kept outside the template (fetched from CDN)

## Error Handling

### Fatal Mode
The decoder uses `fatal: true`:

```typescript
const decoder = new TextDecoder('utf-8', { fatal: true });
```

**Benefits:**
- ❌ Throws error on invalid UTF-8 (no silent corruption)
- ✅ Files are either valid or skipped (no partial corruption)
- ✅ Clear error messages for debugging

**vs. Non-Fatal Mode:**
```typescript
// DON'T DO THIS
const decoder = new TextDecoder('utf-8', { fatal: false });
// Invalid bytes → � (U+FFFD) - Silent data corruption!
```

## BOM Handling

### UTF-8 BOM Removal
The Byte Order Mark (BOM) is automatically stripped:

```typescript
// File starts with: EF BB BF (UTF-8 BOM)
// Decoded as: U+FEFF
// After removal: Normal text without BOM
```

**Why Remove BOM?**
- Modern tools don't require BOM for UTF-8
- BOM can cause issues in:
  - JavaScript (syntax error at file start)
  - JSON parsing
  - Concatenated files

## Edge Cases

### Handling Non-UTF-8 Files

If you encounter templates with non-UTF-8 files:

```typescript
// Option 1: Convert to UTF-8 before zipping
iconv -f ISO-8859-1 -t UTF-8 file.txt > file_utf8.txt

// Option 2: List in .donttouch_files.json
{
  "legacy_file.txt": "ISO-8859-1 encoded, do not modify"
}
```

### SVG Files
SVG files are XML (text) but may declare encoding:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- This is fine, UTF-8 is standard -->

<?xml version="1.0" encoding="ISO-8859-1"?>
<!-- This will fail, convert to UTF-8 first -->
```

**Solution:** Always save SVG files as UTF-8

## Testing for Encoding Issues

### Verify Templates

```bash
# Check for non-UTF-8 files
find . -type f -exec file {} \; | grep -v UTF-8

# Check for BOM
find . -type f -exec sh -c 'head -c 3 "$1" | xxd | grep -q "efbb bf"' _ {} \; -print

# Convert to UTF-8
find . -name "*.js" -exec sh -c 'iconv -f ISO-8859-1 -t UTF-8 "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
```

### Template Validation

Before creating a template:
1. ✅ All text files are UTF-8 encoded
2. ✅ No UTF-8 BOM (unless required by specific tool)
3. ✅ Binary files listed in `.redacted_files.json`
4. ✅ Test extraction with ZipExtractor

## Performance

### Decoding Speed
- **UTF-8 Decoding**: ~100MB/s (native TextDecoder)
- **BOM Check**: O(1) - single character check
- **Memory**: Minimal overhead, streaming decode

### Error Recovery
If a file fails UTF-8 validation:
- File is logged as warning
- File is skipped (not added to output)
- Extraction continues for other files
- No partial corruption

## Compatibility

### Browser Support
`TextDecoder` with `fatal` mode:
- ✅ Chrome 38+
- ✅ Firefox 36+
- ✅ Safari 10.1+
- ✅ Edge 79+
- ✅ Node.js 11.0+
- ✅ Cloudflare Workers (full support)

### Encoding Detection Libraries

If you need to support non-UTF-8 files, consider:

```typescript
import { detect } from 'chardet'; // Encoding detection
import iconv from 'iconv-lite';    // Encoding conversion

// Detect encoding
const encoding = detect(fileData);

// Convert to UTF-8
const utf8Data = iconv.decode(fileData, encoding);
```

**Note:** Not recommended for templates - adds complexity and dependencies.

## Recommendations

### For Template Authors
1. **Use UTF-8**: All text files should be UTF-8 encoded
2. **No BOM**: Save without BOM (most editors do this by default)
3. **Minimize Binary**: Keep binary assets to a minimum
4. **Document Encoding**: If you must use non-UTF-8, document it clearly

### For Platform Developers
1. **Validate Templates**: Check encoding before accepting templates
2. **Clear Errors**: Provide helpful messages for encoding issues
3. **Binary Strategy**: Define clear rules for binary file handling
4. **Test Edge Cases**: Test with intentionally malformed files

## Future Enhancements

Potential improvements:
1. **Binary Support**: Store binary files as base64 in separate field
2. **Encoding Detection**: Auto-detect and convert non-UTF-8
3. **Streaming**: Process large files in chunks
4. **Validation API**: Endpoint to validate template encoding before upload
