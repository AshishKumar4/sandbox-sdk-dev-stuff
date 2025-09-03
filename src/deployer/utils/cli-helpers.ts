/**
 * Common CLI helper functions for Node.js deployment scripts
 * These functions handle filesystem operations and environment variables
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';
import { 
  createAssetManifest,
  bufferToArrayBuffer
} from './index.js';
import { parseWranglerConfig } from '../deploy';

/**
 * Get Cloudflare Account ID from environment variable
 */
export function getAccountIdFromEnv(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
  }
  return accountId;
}

/**
 * Get Cloudflare API Token from environment variable
 */
export function getApiTokenFromEnv(): string {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
  }
  return apiToken;
}

/**
 * Read worker script file
 */
export function readWorkerScript(scriptPath: string): string {
  return readFileSync(scriptPath, 'utf-8');
}

/**
 * Recursively read all asset files from a directory
 */
export function readAssetFiles(assetsDir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  
  function walkDirectory(dir: string, basePath: string = '') {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = basePath + '/' + entry.name;
      
      if (entry.isDirectory()) {
        walkDirectory(fullPath, relativePath);
      } else if (entry.isFile()) {
        const content = readFileSync(fullPath);
        files.set(relativePath, content);
      }
    }
  }
  
  walkDirectory(assetsDir);
  return files;
}

/**
 * Parse wrangler configuration file from file path (Node.js specific)
 * This is the filesystem version that matches the old config-parser.ts
 */
export function parseWranglerConfigFromFile(configPath: string): any {
  const configContent = readFileSync(configPath, 'utf-8');
  return parseWranglerConfig(configContent);
}

/**
 * Find and parse wrangler configuration file
 */
export function findAndParseConfig(workingDir: string): any {
  let configPath = join(workingDir, 'wrangler.jsonc');
  if (!existsSync(configPath)) {
    configPath = join(workingDir, 'wrangler.json');
  }
  if (!existsSync(configPath)) {
    throw new Error(`No wrangler config found in ${workingDir}`);
  }
  
  console.log(`📝 Reading config from: ${configPath}`);
  return parseWranglerConfigFromFile(configPath);
}

/**
 * Process Vite build output and load additional modules
 */
export function processViteBuild(
  config: any,
  distPath: string,
  workerPath: string
): {
  workerPath: string;
  assetsPath: string;
  additionalModules?: Map<string, string>;
  compatibilityFlags?: string[];
} {
  let finalWorkerPath = workerPath;
  let assetsPath = join(distPath, 'client');
  let additionalModules: Map<string, string> | undefined;
  let compatibilityFlags: string[] | undefined = config.compatibility_flags;
  
  // Check if this is a Vite build with additional structure
  const viteOutputDir = join(distPath, `${config.name.replace(/-/g, '_')}`);
  if (existsSync(viteOutputDir)) {
    console.log(`🌟 Detected Vite build output at: ${viteOutputDir}`);
    
    // Read the generated wrangler.json for additional config
    const generatedConfigPath = join(viteOutputDir, 'wrangler.json');
    if (existsSync(generatedConfigPath)) {
      const generatedConfig = parse(readFileSync(generatedConfigPath, 'utf-8'));
      compatibilityFlags = generatedConfig.compatibility_flags || compatibilityFlags;
      // Get migrations from generated config if present
      if (generatedConfig.migrations) {
        config.migrations = generatedConfig.migrations;
      }
      
      // Use the Vite output paths
      finalWorkerPath = join(viteOutputDir, 'index.js');
      assetsPath = join(distPath, 'client'); // Assets still in dist/client
      
      // Load additional modules from assets directory
      const viteAssetsDir = join(viteOutputDir, 'assets');
      if (existsSync(viteAssetsDir)) {
        additionalModules = new Map();
        const moduleFiles = readdirSync(viteAssetsDir);
        for (const file of moduleFiles) {
          if (file.endsWith('.js') || file.endsWith('.mjs')) {
            const modulePath = join(viteAssetsDir, file);
            const moduleContent = readFileSync(modulePath, 'utf-8');
            additionalModules.set(`assets/${file}`, moduleContent);
            console.log(`  📦 Found module: assets/${file}`);
          }
        }
      }
    }
  }
  
  return {
    workerPath: finalWorkerPath,
    assetsPath,
    additionalModules,
    compatibilityFlags
  };
}

/**
 * Process assets directory and create manifest
 */
export async function processAssets(assetsPath: string): Promise<{
  assetsManifest: Record<string, { hash: string; size: number }>;
  fileContents: Map<string, Buffer>;
}> {
  console.log(`\n📁 Assets directory found at: ${assetsPath}`);
  
  // Read all asset files
  const fileContents = readAssetFiles(assetsPath);
  
  // Convert Buffer to ArrayBuffer for the pure function
  const filesAsArrayBuffer = new Map<string, ArrayBuffer>();
  for (const [path, buffer] of fileContents.entries()) {
    filesAsArrayBuffer.set(path, bufferToArrayBuffer(buffer));
  }
  
  // Create asset manifest using pure function
  const assetsManifest = await createAssetManifest(filesAsArrayBuffer);
  const assetCount = Object.keys(assetsManifest).length;
  console.log(`✅ Found ${assetCount} asset files`);
  
  return { assetsManifest, fileContents };
}