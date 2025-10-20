#!/usr/bin/env bun

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ZipExtractor } from './src/sandbox/zipExtractor';
import { FileTreeBuilder } from './src/sandbox/fileTreeBuilder';

/**
 * Comprehensive benchmark for ZipExtractor
 * Measures CPU time, memory usage, and throughput
 */

interface BenchmarkResult {
    templateName: string;
    zipSize: number;
    uncompressedSize: number;
    fileCount: number;
    
    // Timing metrics (milliseconds)
    extractionTime: number;
    fileTreeBuildTime: number;
    totalTime: number;
    
    // Memory metrics (bytes)
    memoryBefore: number;
    memoryAfter: number;
    memoryDelta: number;
    memoryPeak: number;
    
    // CPU metrics
    cpuTimeMs: number;
    
    // Throughput metrics
    throughputMBps: number;
    filesPerSecond: number;
}

interface BenchmarkSummary {
    totalTemplates: number;
    totalFiles: number;
    totalZipSize: number;
    totalUncompressedSize: number;
    
    avgExtractionTime: number;
    avgFileTreeTime: number;
    avgTotalTime: number;
    
    avgMemoryUsage: number;
    peakMemoryUsage: number;
    
    avgThroughput: number;
    totalCpuTime: number;
    
    results: BenchmarkResult[];
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

function getMemoryUsage(): { used: number; total: number } {
    const mem = process.memoryUsage();
    return {
        used: mem.heapUsed,
        total: mem.heapTotal
    };
}

function forceGC() {
    if (global.gc) {
        global.gc();
    }
}

async function benchmarkExtraction(templateName: string, zipPath: string): Promise<BenchmarkResult> {
    console.log(`\n🔬 Benchmarking: ${templateName}`);
    console.log('─'.repeat(60));
    
    // Get zip file size
    const zipStats = statSync(zipPath);
    const zipSize = zipStats.size;
    console.log(`📦 Zip size: ${formatBytes(zipSize)}`);
    
    // Force GC before benchmark
    forceGC();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Memory before
    const memBefore = getMemoryUsage();
    
    // Read zip file
    const zipBuffer = readFileSync(zipPath);
    
    // Benchmark extraction
    const extractStart = performance.now();
    const cpuStart = process.cpuUsage();
    
    const files = ZipExtractor.extractFiles(zipBuffer.buffer);
    
    const extractEnd = performance.now();
    const extractionTime = extractEnd - extractStart;
    
    // Benchmark file tree building
    const treeStart = performance.now();
    
    const fileTree = FileTreeBuilder.buildFromTemplateFiles(files, { rootPath: '.' });
    
    const treeEnd = performance.now();
    const fileTreeBuildTime = treeEnd - treeStart;
    
    const cpuEnd = process.cpuUsage(cpuStart);
    const cpuTimeMs = (cpuEnd.user + cpuEnd.system) / 1000; // Convert microseconds to milliseconds
    
    // Calculate uncompressed size
    let uncompressedSize = 0;
    for (const file of files) {
        uncompressedSize += file.fileContents.length;
    }
    
    // Memory after
    const memAfter = getMemoryUsage();
    const memoryDelta = memAfter.used - memBefore.used;
    
    // Sample memory a few times to find peak
    let peakMemory = memAfter.used;
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        const sample = getMemoryUsage().used;
        if (sample > peakMemory) peakMemory = sample;
    }
    
    const totalTime = extractionTime + fileTreeBuildTime;
    const throughputMBps = (uncompressedSize / (1024 * 1024)) / (totalTime / 1000);
    const filesPerSecond = files.length / (totalTime / 1000);
    
    console.log(`⏱️  Extraction: ${formatTime(extractionTime)}`);
    console.log(`🌳 File tree: ${formatTime(fileTreeBuildTime)}`);
    console.log(`⏱️  Total: ${formatTime(totalTime)}`);
    console.log(`💾 Memory: ${formatBytes(memoryDelta)} (peak: ${formatBytes(peakMemory)})`);
    console.log(`⚡ CPU time: ${formatTime(cpuTimeMs)}`);
    console.log(`📊 Throughput: ${throughputMBps.toFixed(2)} MB/s`);
    console.log(`📈 Files/sec: ${filesPerSecond.toFixed(0)}`);
    console.log(`📁 Files: ${files.length} (${formatBytes(uncompressedSize)} uncompressed)`);
    
    return {
        templateName,
        zipSize,
        uncompressedSize,
        fileCount: files.length,
        extractionTime,
        fileTreeBuildTime,
        totalTime,
        memoryBefore: memBefore.used,
        memoryAfter: memAfter.used,
        memoryDelta,
        memoryPeak: peakMemory,
        cpuTimeMs,
        throughputMBps,
        filesPerSecond
    };
}

async function runBenchmarks(): Promise<BenchmarkSummary> {
    console.log('\n⚡ ZipExtractor Performance Benchmark');
    console.log('='.repeat(60));
    console.log('Measuring: CPU time, Memory usage, Throughput\n');
    
    // Check if GC is available
    if (!global.gc) {
        console.log('⚠️  Warning: GC not exposed. Run with --expose-gc for accurate memory measurements');
        console.log('   Example: bun --expose-gc benchmark-zip-extractor.ts\n');
    }
    
    const templatesDir = join(process.cwd(), 'templates', 'zips');
    const zipFiles = readdirSync(templatesDir)
        .filter(f => f.endsWith('.zip'))
        .sort();
    
    if (zipFiles.length === 0) {
        console.error('❌ No zip files found in templates/zips');
        process.exit(1);
    }
    
    console.log(`📦 Found ${zipFiles.length} template(s) to benchmark\n`);
    
    const results: BenchmarkResult[] = [];
    
    for (const zipFile of zipFiles) {
        const templateName = zipFile.replace('.zip', '');
        const zipPath = join(templatesDir, zipFile);
        
        try {
            const result = await benchmarkExtraction(templateName, zipPath);
            results.push(result);
            
            // Force GC between benchmarks
            forceGC();
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`❌ Error benchmarking ${templateName}:`, error);
        }
    }
    
    // Calculate summary statistics
    const totalFiles = results.reduce((sum, r) => sum + r.fileCount, 0);
    const totalZipSize = results.reduce((sum, r) => sum + r.zipSize, 0);
    const totalUncompressedSize = results.reduce((sum, r) => sum + r.uncompressedSize, 0);
    
    const avgExtractionTime = results.reduce((sum, r) => sum + r.extractionTime, 0) / results.length;
    const avgFileTreeTime = results.reduce((sum, r) => sum + r.fileTreeBuildTime, 0) / results.length;
    const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
    
    const avgMemoryUsage = results.reduce((sum, r) => sum + r.memoryDelta, 0) / results.length;
    const peakMemoryUsage = Math.max(...results.map(r => r.memoryPeak));
    
    const avgThroughput = results.reduce((sum, r) => sum + r.throughputMBps, 0) / results.length;
    const totalCpuTime = results.reduce((sum, r) => sum + r.cpuTimeMs, 0);
    
    return {
        totalTemplates: results.length,
        totalFiles,
        totalZipSize,
        totalUncompressedSize,
        avgExtractionTime,
        avgFileTreeTime,
        avgTotalTime,
        avgMemoryUsage,
        peakMemoryUsage,
        avgThroughput,
        totalCpuTime,
        results
    };
}

function printSummary(summary: BenchmarkSummary) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Benchmark Summary');
    console.log('='.repeat(60));
    
    console.log('\n📦 Volume:');
    console.log(`   Templates: ${summary.totalTemplates}`);
    console.log(`   Total files: ${summary.totalFiles}`);
    console.log(`   Total zip size: ${formatBytes(summary.totalZipSize)}`);
    console.log(`   Total uncompressed: ${formatBytes(summary.totalUncompressedSize)}`);
    console.log(`   Compression ratio: ${(summary.totalZipSize / summary.totalUncompressedSize * 100).toFixed(1)}%`);
    
    console.log('\n⏱️  Average Timing:');
    console.log(`   Extraction: ${formatTime(summary.avgExtractionTime)}`);
    console.log(`   File tree: ${formatTime(summary.avgFileTreeTime)}`);
    console.log(`   Total: ${formatTime(summary.avgTotalTime)}`);
    
    console.log('\n💾 Memory Usage:');
    console.log(`   Average delta: ${formatBytes(summary.avgMemoryUsage)}`);
    console.log(`   Peak usage: ${formatBytes(summary.peakMemoryUsage)}`);
    console.log(`   Memory efficiency: ${(summary.avgMemoryUsage / summary.totalUncompressedSize * 100).toFixed(1)}% overhead`);
    
    console.log('\n⚡ CPU & Performance:');
    console.log(`   Total CPU time: ${formatTime(summary.totalCpuTime)}`);
    console.log(`   Average throughput: ${summary.avgThroughput.toFixed(2)} MB/s`);
    console.log(`   CPU efficiency: ${(summary.totalCpuTime / (summary.avgTotalTime * summary.totalTemplates) * 100).toFixed(1)}% CPU utilization`);
    
    console.log('\n🏆 Best Performers:');
    const fastest = summary.results.reduce((best, r) => r.totalTime < best.totalTime ? r : best);
    const mostEfficient = summary.results.reduce((best, r) => r.throughputMBps > best.throughputMBps ? r : best);
    console.log(`   Fastest: ${fastest.templateName} (${formatTime(fastest.totalTime)})`);
    console.log(`   Most efficient: ${mostEfficient.templateName} (${mostEfficient.throughputMBps.toFixed(2)} MB/s)`);
    
    console.log('\n📈 Cloudflare Workers Context:');
    console.log(`   CPU time limit: 50ms (production) / 30s (development)`);
    console.log(`   Average CPU used: ${formatTime(summary.totalCpuTime / summary.totalTemplates)}`);
    console.log(`   Fits in limit: ${summary.totalCpuTime / summary.totalTemplates < 50 ? '✅ Yes' : '⚠️  No (use streaming)'}`);
    console.log(`   Memory limit: 128MB`);
    console.log(`   Peak memory: ${formatBytes(summary.peakMemoryUsage)} (${(summary.peakMemoryUsage / (128 * 1024 * 1024) * 100).toFixed(1)}% of limit)`);
    
    console.log('\n' + '='.repeat(60));
}

function printDetailedTable(summary: BenchmarkSummary) {
    console.log('\n📋 Detailed Results\n');
    
    console.log('┌' + '─'.repeat(78) + '┐');
    console.log('│ Template'.padEnd(25) + '│' + 
                ' Files'.padEnd(8) + '│' +
                ' Time'.padEnd(12) + '│' +
                ' CPU'.padEnd(11) + '│' +
                ' Memory'.padEnd(12) + '│' +
                ' MB/s'.padEnd(10) + '│');
    console.log('├' + '─'.repeat(78) + '┤');
    
    for (const result of summary.results) {
        const name = result.templateName.length > 22 
            ? result.templateName.substring(0, 19) + '...' 
            : result.templateName;
        
        console.log(
            '│ ' + name.padEnd(23) + '│' +
            ' ' + result.fileCount.toString().padStart(6) + '│' +
            ' ' + formatTime(result.totalTime).padStart(10) + '│' +
            ' ' + formatTime(result.cpuTimeMs).padStart(9) + '│' +
            ' ' + formatBytes(result.memoryDelta).padStart(10) + '│' +
            ' ' + result.throughputMBps.toFixed(1).padStart(8) + '│'
        );
    }
    
    console.log('└' + '─'.repeat(78) + '┘');
}

// Main execution
async function main() {
    const startTime = Date.now();
    
    const summary = await runBenchmarks();
    
    printSummary(summary);
    printDetailedTable(summary);
    
    const totalDuration = Date.now() - startTime;
    console.log(`\n✅ Benchmark completed in ${formatTime(totalDuration)}`);
    console.log(`\n💡 Tip: Run with --expose-gc for more accurate memory measurements:`);
    console.log(`   bun --expose-gc benchmark-zip-extractor.ts\n`);
}

main().catch(error => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
});
