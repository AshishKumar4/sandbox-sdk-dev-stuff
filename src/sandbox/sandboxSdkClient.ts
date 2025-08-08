import { getSandbox, Sandbox, parseSSEStream, type ExecEvent, ExecuteResponse, LogEvent } from '@cloudflare/sandbox';

import {
    TemplateDetailsResponse,
    BootstrapResponse,
    GetInstanceResponse,
    BootstrapStatusResponse,
    ShutdownResponse,
    WriteFilesRequest,
    WriteFilesResponse,
    GetFilesResponse,
    ExecuteCommandsResponse,
    RuntimeErrorResponse,
    ClearErrorsResponse,
    StaticAnalysisResponse,
    DeploymentResult,
    FileTreeNode,
    RuntimeError,
    CommandExecutionResult,
    CodeIssue,
    InstanceDetails,
    LintSeverity,
    TemplateInfo,
    TemplateDetails,
    GitHubInitRequest, GitHubInitResponse, GitHubPushRequest, GitHubPushResponse,
    GetLogsResponse,
    ListInstancesResponse,
    SaveInstanceResponse,
    ResumeInstanceResponse,
} from './sandboxTypes';

import { createObjectLogger } from '../logger';
import { env } from 'cloudflare:workers'
import { BaseSandboxService } from './BaseSandboxService';

import { deployToCloudflareWorkers } from '../deploymentService';
import { TokenService } from '../auth/tokenService';
import { CodeFixResult, FileFetcher, fixProjectIssues } from '../code-fixer';
import { FileObject } from '@/code-fixer/types';
// Export the Sandbox class in your Worker
export { Sandbox as UserAppSandboxService, Sandbox as DeployerService} from "@cloudflare/sandbox";


interface InstanceMetadata {
    templateName: string;
    projectName: string;
    startTime: string;
    webhookUrl?: string;
    previewURL?: string;
    tunnelURL?: string;
    processId?: string;
    allocatedPort?: number;
}

type SandboxType = DurableObjectStub<Sandbox<Env>>;

/**
 * Streaming event for enhanced command execution
 */
export interface StreamEvent {
    type: 'stdout' | 'stderr' | 'exit' | 'error';
    data?: string;
    code?: number;
    error?: string;
    timestamp: Date;
}
  
const NUM_CONTAINER_POOLS = 2;
function getAutoAllocatedSandbox(sessionId: string): string {
    // We have N containers and we can have M sessionIds at once. M >> N
    // So we algorithmically assign sessionId to containerId
    // SessionId are usually UUIDs, so we first convert it to an integer
    
    // Simple hash function to convert sessionId to integer
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Make hash positive
    hash = Math.abs(hash);
    
    // Consistently map to one of N containers
    const containerIndex = hash % NUM_CONTAINER_POOLS;
    
    // Create a deterministic container ID based on the index
    const containerId = `container-pool-${containerIndex}`;
    
    console.log(`Session ${sessionId} mapped to Sandbox ${containerId} (hash: ${hash}, index: ${containerIndex})`);
    return containerId;
}

export class SandboxSdkClient extends BaseSandboxService {
    private sandbox: SandboxType;
    private hostname: string;
    private metadataCache = new Map<string, InstanceMetadata>();
    
    private envVars?: Record<string, string>;

    constructor(sandboxId: string, hostname: string, envVars?: Record<string, string>) {
        super(getAutoAllocatedSandbox(sandboxId));
        this.sandbox = this.getSandbox();
        this.hostname = hostname;
        this.envVars = envVars;
        // Set environment variables FIRST, before any other operations
        if (this.envVars && Object.keys(this.envVars).length > 0) {
            this.logger.info('Setting environment variables', { envVars: Object.keys(this.envVars) });
            this.sandbox.setEnvVars(this.envVars);
        }
        
        this.logger = createObjectLogger(this, 'SandboxSdkClient');
        this.logger.setFields({
            sandboxId: this.sandboxId
        });
        this.logger.info('Initialized SandboxSdkClient session', { sandboxId: this.sandboxId });
    }

    async initialize(): Promise<void> {
        // Run a echo command to check if the sandbox is working
        const echoResult = await this.sandbox.exec('echo "Hello World"');
        if (echoResult.exitCode !== 0) {
            throw new Error(`Failed to run echo command: ${echoResult.stderr}`);
        }
        this.logger.info('Sandbox is up and running')
    }

    private getSandbox(): SandboxType {
        if (!this.sandbox) {
            this.sandbox = getSandbox(env.Sandbox, this.sandboxId);
        }
        return this.sandbox;
    }

    private getRuntimeErrorFile(instanceId: string): string {
        return `${instanceId}-runtime_errors.json`;
    }

    private getInstanceMetadataFile(instanceId: string): string {
        return `${instanceId}-metadata.json`;
    }

    private async executeCommand(instanceId: string, command: string, timeout?: number): Promise<ExecuteResponse> {
        return await this.getSandbox().exec(`cd ${instanceId} && ${command}`, { timeout });
    }

    private async storeRuntimeError(instanceId: string, error: RuntimeError): Promise<void> {
        try {
            const errorFile = this.getRuntimeErrorFile(instanceId);
            const sandbox = this.getSandbox();
            
            // Read existing errors
            let errors: RuntimeError[] = [];
            try {
                const existingFile = await sandbox.readFile(errorFile);
                errors = JSON.parse(existingFile.content) as RuntimeError[];
            } catch {
                // No existing errors file
            }
            
            errors.push(error);
            
            // Keep only last 100 errors
            if (errors.length > 100) {
                errors = errors.slice(-100);
            }
            
            await sandbox.writeFile(errorFile, JSON.stringify(errors));
        } catch (writeError) {
            this.logger.warn('Failed to store runtime error', writeError);
        }
    }

    private async getInstanceMetadata(instanceId: string): Promise<InstanceMetadata | null> {
        // Check cache first
        if (this.metadataCache.has(instanceId)) {
            return this.metadataCache.get(instanceId)!;
        }
        
        // Cache miss - read from disk
        try {
            const metadataFile = await this.getSandbox().readFile(this.getInstanceMetadataFile(instanceId));
            const metadata = JSON.parse(metadataFile.content) as InstanceMetadata;
            this.metadataCache.set(instanceId, metadata); // Cache it
            return metadata;
        } catch {
            return null;
        }
    }

    private async storeInstanceMetadata(instanceId: string, metadata: InstanceMetadata): Promise<void> {
        await this.getSandbox().writeFile(this.getInstanceMetadataFile(instanceId), JSON.stringify(metadata));
        this.metadataCache.set(instanceId, metadata); // Update cache
    }

    private invalidateMetadataCache(instanceId: string): void {
        this.metadataCache.delete(instanceId);
    }

    private async allocateAvailablePort(excludedPorts: number[] = [3000]): Promise<number> {
        const startTime = Date.now();
        const excludeList = excludedPorts.join(' ');
        
        // Single command to find first available port in dev range (8001-8999)
        const findPortCmd = `
            for port in $(seq 8001 8999); do
                if ! echo "${excludeList}" | grep -q "\\\\b$port\\\\b" && 
                   ! netstat -tuln 2>/dev/null | grep -q ":$port " && 
                   ! ss -tuln 2>/dev/null | grep -q ":$port "; then
                    echo $port
                    exit 0
                fi
            done
            exit 1
        `;
        
        const result = await this.getSandbox().exec(findPortCmd.trim());
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        this.logger.info(`Port allocation took ${duration} seconds`);
        if (result.exitCode === 0 && result.stdout.trim()) {
            const port = parseInt(result.stdout.trim());
            this.logger.info(`Allocated available port: ${port}`);
            return port;
        }
        
        throw new Error('No available ports found in range 8001-8999');
    }

    private async checkTemplateExists(templateName: string): Promise<boolean> {
        // Single command to check if template directory and package.json both exist
        const sandbox = this.getSandbox();
        const checkResult = await sandbox.exec(`test -f ${templateName}/package.json && echo "exists" || echo "missing"`);
        return checkResult.exitCode === 0 && checkResult.stdout.trim() === "exists";
    }

    async downloadTemplate(templateName: string, downloadDir?: string) : Promise<ArrayBuffer> {
        // Fetch the zip file from R2
        let zipData: ArrayBuffer;
        const downloadUrl = downloadDir ? `${downloadDir}/${templateName}.zip` : `${templateName}.zip`;
        this.logger.info(`Fetching object: ${downloadUrl} from R2 bucket`);
        const r2Object = await env.TEMPLATES_BUCKET.get(downloadUrl);
          
        if (!r2Object) {
            throw new Error(`Object '${downloadUrl}' not found in bucket`);
        }
    
        zipData = await r2Object.arrayBuffer();
    
        this.logger.info(`Downloaded zip file (${zipData.byteLength} bytes)`);
        return zipData;
    }

    private async ensureTemplateExists(templateName: string, downloadDir?: string, isInstance: boolean = false) {
        if (!await this.checkTemplateExists(templateName)) {
            // Download and extract template
            this.logger.info(`Template doesnt exist, Downloading template from: ${templateName}`);
            
            // const downloadCmd = `mkdir -p ${templateName} && wget -q "${templateUrl}" -O "${templateName}.zip" && unzip -o -q "${templateName}.zip" -d ${templateName}`;

            const zipData = await this.downloadTemplate(templateName, downloadDir);

            const zipBuffer = new Uint8Array(zipData);
            // Convert Uint8Array to base64 using Web API (compatible with Cloudflare Workers)
            // Process in chunks to avoid stack overflow on large files
            let binaryString = '';
            const chunkSize = 0x8000; // 32KB chunks
            for (let i = 0; i < zipBuffer.length; i += chunkSize) {
                const chunk = zipBuffer.subarray(i, i + chunkSize);
                binaryString += String.fromCharCode(...chunk);
            }
            const base64Data = btoa(binaryString);
            await this.getSandbox().writeFile(`${templateName}.zip.b64`, base64Data);
            
            // Convert base64 back to binary zip file
            await this.getSandbox().exec(`base64 -d ${templateName}.zip.b64 > ${templateName}.zip`);
            this.logger.info(`Wrote and converted zip file to sandbox: ${templateName}.zip`);
            
            const setupResult = await this.getSandbox().exec(`unzip -o -q ${templateName}.zip -d ${isInstance ? '.' : templateName}`);
        
            if (setupResult.exitCode !== 0) {
                throw new Error(`Failed to download/extract template: ${setupResult.stderr}`);
            }
        } else {
            this.logger.info(`Template already exists`);
        }
    }

    async getTemplateDetails(templateName: string): Promise<TemplateDetailsResponse> {
        try {
            this.logger.info(`Getting template details for: ${templateName}`);
            
            await this.ensureTemplateExists(templateName);

            this.logger.info(`Template setup completed`);

            const filesResponse = await this.getFiles(templateName);    // Use template name as directory

            this.logger.info(`Files fetched successfully`);

            // Parse package.json for dependencies
            let dependencies: Record<string, string> = {};
            try {
                const packageJsonFile = await this.getSandbox().readFile(`${templateName}/package.json`);
                const packageJson = JSON.parse(packageJsonFile.content) as {
                    dependencies?: Record<string, string>;
                    devDependencies?: Record<string, string>;
                };
                dependencies = { 
                    ...packageJson.dependencies || {}, 
                    ...packageJson.devDependencies || {}
                };
            } catch {
                this.logger.info(`No package.json found for ${templateName}`);
            }

            // Build file tree
            const fileTree = await this.buildFileTree(templateName);
            if (!fileTree) {
                throw new Error(`Failed to build file tree for template ${templateName}`);
            }
            
            const catalogInfo = await this.getTemplateFromCatalog(templateName);
            
            const templateDetails: TemplateDetails = {
                name: templateName,
                description: {
                    selection: catalogInfo?.description.selection || '',
                    usage: catalogInfo?.description.usage || ''
                },
                fileTree,
                files: filesResponse.files,
                language: catalogInfo?.language,
                deps: dependencies,
                frameworks: catalogInfo?.frameworks || []
            };
            
            this.logger.info(`Successfully retrieved ${filesResponse.files.length} files for template ${templateName}`);

            return {
                success: true,
                templateDetails
            };
        } catch (error) {
            this.logger.error('getTemplateDetails', error, { templateName });
            return {
                success: false,
                error: `Failed to get template details: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    private async getTemplateFromCatalog(templateName: string): Promise<TemplateInfo | null> {
        try {
            const templatesResponse = await SandboxSdkClient.listTemplates();
            if (templatesResponse.success) {
                return templatesResponse.templates.find(t => t.name === templateName) || null;
            }
            return null;
        } catch {
            return null;
        }
    }

    private async buildFileTree(instanceId: string): Promise<FileTreeNode | undefined> {
        try {
            const buildTreeCmd = `echo "===FILES==="; find . -type d \\( -name "node_modules" -o -name ".git" -o -name "dist" -o -name ".wrangler" -o -name ".vscode" -o -name ".next" -o -name ".cache" -o -name ".idea" -o -name ".DS_Store" \\) -prune -o \\( -type f -not -name "*.jpg" -not -name "*.jpeg" -not -name "*.png" -not -name "*.gif" -not -name "*.svg" -not -name "*.ico" -not -name "*.webp" -not -name "*.bmp" \\) -print; echo "===DIRS==="; find . -type d \\( -name "node_modules" -o -name ".git" -o -name "dist" -o -name ".wrangler" -o -name ".vscode" -o -name ".next" -o -name ".cache" -o -name ".idea" -o -name ".DS_Store" \\) -prune -o -type d -print`;

            const filesResult = await this.executeCommand(instanceId, buildTreeCmd);
            if (filesResult.exitCode === 0) {
                const output = filesResult.stdout.trim();
                const sections = output.split('===DIRS===');
                const fileSection = sections[0].replace('===FILES===', '').trim();
                const dirSection = sections[1] ? sections[1].trim() : '';
                
                const files = fileSection.split('\n').filter(line => line.trim() && line !== '.');
                const dirs = dirSection.split('\n').filter(line => line.trim() && line !== '.');
                
                // Create sets for quick lookup
                const fileSet = new Set(files.map(f => f.startsWith('./') ? f.substring(2) : f));
                // const dirSet = new Set(dirs.map(d => d.startsWith('./') ? d.substring(2) : d));
                
                // Combine all paths
                const allPaths = [...files, ...dirs].map(path => 
                    path.startsWith('./') ? path.substring(2) : path
                ).filter(path => path && path !== '.');
                
                // Build tree with proper file/directory detection
                const root: FileTreeNode = {
                    path: '',
                    type: 'directory',
                    children: []
                };

                allPaths.forEach(filePath => {
                    const parts = filePath.split('/').filter(part => part);
                    let current = root;

                    parts.forEach((_, index) => {
                        const path = parts.slice(0, index + 1).join('/');
                        const isFile = fileSet.has(path);
                        
                        let child = current.children?.find(c => c.path === path);
                        
                        if (!child) {
                            child = {
                                path,
                                type: isFile ? 'file' : 'directory',
                                children: isFile ? undefined : []
                            };
                            current.children = current.children || [];
                            current.children.push(child);
                        }
                        
                        if (!isFile) {
                            current = child;
                        }
                    });
                });

                return root;
            }
        } catch (error) {
            this.logger.warn('Failed to build file tree', error);
        }
        return undefined;
    }

    // ==========================================
    // INSTANCE LIFECYCLE
    // ==========================================

    async listAllInstances(): Promise<ListInstancesResponse> {
        try {
            this.logger.info('Listing all instances using bulk metadata read');
            
            const sandbox = this.getSandbox();
            
            // Use a single command to find metadata files only in current directory (not nested)
            const bulkResult = await sandbox.exec(`find . -maxdepth 1 -name "*-metadata.json" -type f -exec sh -c 'echo "===FILE:$1==="; cat "$1"' _ {} \\;`);
            
            if (bulkResult.exitCode !== 0) {
                return {
                    success: true,
                    instances: [],
                    count: 0
                };
            }
            
            const instances: InstanceDetails[] = [];
            
            // Parse the combined output
            const sections = bulkResult.stdout.split('===FILE:').filter(section => section.trim());
            
            for (const section of sections) {
                try {
                    const lines = section.trim().split('\n');
                    if (lines.length < 2) continue;
                    
                    // First line contains the file path, remaining lines contain the JSON
                    const filePath = lines[0].replace('===', '');
                    const jsonContent = lines.slice(1).join('\n');
                    
                    // Extract instance ID from filename (remove ./ prefix and -metadata.json suffix)
                    const instanceId = filePath.replace('./', '').replace('-metadata.json', '');
                    
                    // Parse metadata
                    const metadata = JSON.parse(jsonContent) as InstanceMetadata;
                    
                    // Update cache with the metadata we just read
                    this.metadataCache.set(instanceId, metadata);
                    
                    // Create lightweight instance details from metadata
                    const instanceDetails: InstanceDetails = {
                        runId: instanceId,
                        templateName: metadata.templateName,
                        startTime: new Date(metadata.startTime),
                        uptime: Math.floor((Date.now() - new Date(metadata.startTime).getTime()) / 1000),
                        directory: instanceId,
                        serviceDirectory: instanceId,
                        previewURL: metadata.previewURL,
                        processId: metadata.processId,
                        tunnelURL: metadata.tunnelURL,
                        // Skip file tree
                        fileTree: undefined,
                        runtimeErrors: undefined
                    };
                    
                    instances.push(instanceDetails);
                } catch (error) {
                    this.logger.warn(`Failed to process metadata section`, error);
                }
            }
            
            this.logger.info(`Successfully listed ${instances.length} instances using bulk operation`);
            
            return {
                success: true,
                instances,
                count: instances.length
            };
        } catch (error) {
            this.logger.error('listAllInstances', error);
            return {
                success: false,
                instances: [],
                count: 0,
                error: `Failed to list instances: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    private async startDevServer(instanceId: string, port: number): Promise<string> {
        try {
            // Use CLI tools for enhanced monitoring instead of direct process start
            const process = await this.getSandbox().startProcess(
                `monitor-cli process start --instance-id ${instanceId} --port ${port} -- bun run dev`, 
                { cwd: instanceId }
            );
            this.logger.info(`Started dev server with enhanced monitoring for ${instanceId}`);
            return process.id;
        } catch (error) {
            this.logger.warn('Failed to start dev server', error);
            throw error;
        }
    }

    private async startCloudflaredTunnel(instanceId: string, port: number): Promise<string> {
        try {
            const process = await this.getSandbox().startProcess(
                `cloudflared tunnel --url http://localhost:${port}`, 
                { cwd: instanceId }
            );
            this.logger.info(`Started cloudflared tunnel for ${instanceId}`);

            // Stream process logs to extract the preview URL
            const logStream = await this.getSandbox().streamProcessLogs(process.id);
            
            return new Promise<string>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    // reject(new Error('Timeout waiting for cloudflared tunnel URL'));
                    this.logger.warn('Timeout waiting for cloudflared tunnel URL');
                    resolve('');
                }, 20000); // 20 second timeout

                const processLogs = async () => {
                    try {
                        for await (const event of parseSSEStream<LogEvent>(logStream)) {
                            if (event.data) {
                                const logLine = event.data;
                                this.logger.info(`Cloudflared log ===> ${logLine}`);
                                
                                // Look for the preview URL in the logs
                                // Format: https://subdomain.trycloudflare.com
                                const urlMatch = logLine.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                                if (urlMatch) {
                                    clearTimeout(timeout);
                                    const previewURL = urlMatch[0];
                                    this.logger.info(`Found cloudflared tunnel URL: ${previewURL}`);
                                    resolve(previewURL);
                                    return;
                                }
                            }
                        }
                    } catch (error) {
                        this.logger.error('Cloudflare tunnel process failed', error);
                        clearTimeout(timeout);
                        reject(error);
                    }
                };

                processLogs();
            });
        } catch (error) {
            this.logger.warn('Failed to start cloudflared tunnel', error);
            throw error;
        }
    }


    /**
     * Updates project configuration files with the specified project name
     */
    private async updateProjectConfiguration(instanceId: string, projectName: string): Promise<void> {
        try {
            const sandbox = this.getSandbox();
            
            // Update package.json with new project name (top-level only)
            this.logger.info(`Updating package.json with project name: ${projectName}`);
            const packageJsonResult = await sandbox.exec(`cd ${instanceId} && sed -i '1,10s/^[ \t]*"name"[ ]*:[ ]*"[^"]*"/  "name": "${projectName}"/' package.json`);
            
            if (packageJsonResult.exitCode !== 0) {
                this.logger.warn('Failed to update package.json', packageJsonResult.stderr);
            }
            
            // Update wrangler.jsonc with new project name (top-level only)
            this.logger.info(`Updating wrangler.jsonc with project name: ${projectName}`);
            const wranglerResult = await sandbox.exec(`cd ${instanceId} && sed -i '0,/"name":/s/"name"[ ]*:[ ]*"[^"]*"/"name": "${projectName}"/' wrangler.jsonc`);
               
            if (wranglerResult.exitCode !== 0) {
                this.logger.warn('Failed to update wrangler.jsonc', wranglerResult.stderr);
            }
            
            this.logger.info('Project configuration updated successfully');
        } catch (error) {
            this.logger.error(`Error updating project configuration: ${error}`);
            throw error;
        }
    }  
    
    // TODO: REMOVE BEFORE PRODUCTION, SECURITY THREAT! Only for testing and demo
    private async setLocalEnvVars(instanceId: string, localEnvVars: Record<string, string>): Promise<void> {
        try {
            const sandbox = this.getSandbox();
            // Simply save all env vars in '.dev.vars' file
            const envVarsContent = Object.entries(localEnvVars)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            await sandbox.writeFile(`${instanceId}/.dev.vars`, envVarsContent);
        } catch (error) {
            this.logger.error(`Error setting local environment variables: ${error}`);
            throw error;
        }
    }

    private async setupInstance(instanceId: string, projectName: string, localEnvVars?: Record<string, string>): Promise<{previewURL: string, tunnelURL: string, processId: string, allocatedPort: number} | undefined> {
        try {
            const sandbox = this.getSandbox();
            // Update project configuration with the specified project name
            await this.updateProjectConfiguration(instanceId, projectName);
            
            // Allocate single port for both dev server and tunnel
            const allocatedPort = await this.allocateAvailablePort();
                
            // Start cloudflared tunnel using the same port as dev server
            const tunnelPromise = this.startCloudflaredTunnel(instanceId, allocatedPort);
                
            this.logger.info(`Installing dependencies for ${instanceId}`);
            const installResult = await this.executeCommand(instanceId, `bun install`);
            this.logger.info(`Install result: ${installResult.stdout}`);

            if (localEnvVars) {
                await this.setLocalEnvVars(instanceId, localEnvVars);
            }
                
            if (installResult.exitCode === 0) {
                // Try to start development server in background
                try {
                    // Start dev server on allocated port
                    const processId = await this.startDevServer(instanceId, allocatedPort);
                        
                    this.logger.info(`Successfully created instance ${instanceId}, processId: ${processId}, port: ${allocatedPort}`);
                        
                    // Expose the same port for preview URL
                    const previewResult = await sandbox.exposePort(allocatedPort, { hostname: this.hostname });
                    const previewURL = previewResult.url;
                        
                    // Wait for tunnel URL (tunnel forwards to same port)
                    const tunnelURL = await tunnelPromise;
                        
                    this.logger.info(`Exposed preview URL: ${previewURL}, Tunnel URL: ${tunnelURL}`);
                        
                    return { previewURL, tunnelURL, processId, allocatedPort };
                } catch (error) {
                    this.logger.warn('Failed to start dev server or tunnel', error);
                    return undefined;
                }
            } else {
                // Handle dependency installation failure
                const error: RuntimeError = {
                    timestamp: new Date(),
                    message: `Failed to install dependencies: ${installResult.stderr}`,
                    severity: 'warning',
                    source: 'npm_install',
                    rawOutput: `Exit code: ${installResult.exitCode}\nSTDOUT: ${installResult.stdout}\nSTDERR: ${installResult.stderr}`
                };
                await this.storeRuntimeError(instanceId, error);
            }
        } catch (error) {
            this.logger.warn('Failed to setup instance', error);
        }
        
        return undefined;
    }

    async createInstance(templateName: string, projectName: string, webhookUrl?: string, wait?: boolean, localEnvVars?: Record<string, string>): Promise<BootstrapResponse> {
        try {
            const instanceId = `${projectName}-${crypto.randomUUID()}`;
            this.logger.info(`Creating sandbox instance: ${instanceId}`, { templateName: templateName, projectName: projectName });
            
            // Generate JWT bearer token for templates gateway authentication
            const jwtToken = await this.generateTemplatesGatewayToken(this.sandboxId, instanceId);
            
            // Register JWT token in KV for authentication
            await this.registerAuthToken(jwtToken, instanceId);
            
            // Set authentication environment variables for sandbox
            await this.setAuthEnvironmentVariables(jwtToken);
            
            let results: {previewURL: string, tunnelURL: string, processId: string, allocatedPort: number} | undefined;
            await this.ensureTemplateExists(templateName);
            
            const moveTemplateResult = await this.getSandbox().exec(`mv ${templateName} ${instanceId}`);
            if (moveTemplateResult.exitCode !== 0) {
                throw new Error(`Failed to move template: ${moveTemplateResult.stderr}`);
            }
            
            const setupPromise = () => this.setupInstance(instanceId, projectName, localEnvVars);
            if (wait) {
                const setupResult = await setupPromise();
                if (!setupResult) {
                    return {
                        success: false,
                        error: 'Failed to setup instance'
                    };
                }
                results = setupResult;
            } else {
                setupPromise().then(async (result) => {
                    if (!result) {
                        return {
                            success: false,
                            error: 'Failed to setup instance'
                        };
                    }
                    // Store instance metadata
                    const metadata = {
                        templateName: templateName,
                        projectName: projectName,
                        startTime: new Date().toISOString(),
                        webhookUrl: webhookUrl,
                        previewURL: result.previewURL,
                        processId: result.processId,
                        tunnelURL: result.tunnelURL,
                        allocatedPort: result.allocatedPort,
                    };
                    await this.storeInstanceMetadata(instanceId, metadata);
                    this.logger.info(`Successfully updated metadata for instance ${instanceId}`)
                });
            }
            // Store instance metadata
            const metadata = {
                templateName: templateName,
                projectName: projectName,
                startTime: new Date().toISOString(),
                webhookUrl: webhookUrl,
                previewURL: results?.previewURL,
                processId: results?.processId,
                tunnelURL: results?.tunnelURL,
                allocatedPort: results?.allocatedPort,
            };
            await this.storeInstanceMetadata(instanceId, metadata);

            return {
                success: true,
                runId: instanceId,
                message: `Successfully created instance from template ${templateName}`,
                previewURL: results?.previewURL,
                tunnelURL: results?.tunnelURL,
                processId: results?.processId,
            };
        } catch (error) {
            this.logger.error('createInstance', error, { templateName: templateName, projectName: projectName });
            return {
                success: false,
                error: `Failed to create instance: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async getInstanceDetails(instanceId: string): Promise<GetInstanceResponse> {
        try {            
            // Get instance metadata
            const metadata = await this.getInstanceMetadata(instanceId);
            if (!metadata) {
                return {
                    success: false,
                    error: `Instance ${instanceId} not found or metadata corrupted`
                };
            }

            const startTime = new Date(metadata.startTime);
            const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
            // Get file tree
            const fileTree = await this.buildFileTree(instanceId);

            // Get runtime errors
            let runtimeErrors: RuntimeError[] = [];
            try {
                const errorsFile = await this.getSandbox().readFile(this.getRuntimeErrorFile(instanceId));
                runtimeErrors = JSON.parse(errorsFile.content) as RuntimeError[];
            } catch {
                // No errors stored
            }

            const instanceDetails: InstanceDetails = {
                runId: instanceId,
                templateName: metadata.templateName,
                startTime,
                uptime,
                directory: instanceId,
                serviceDirectory: instanceId,
                fileTree,
                runtimeErrors,
                previewURL: metadata.previewURL,
                processId: metadata.processId,
                tunnelURL: metadata.tunnelURL,
            };

            return {
                success: true,
                instance: instanceDetails
            };
        } catch (error) {
            this.logger.error('getInstanceDetails', error, { instanceId });
            return { 
                success: false,
                error: `Failed to get instance details: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse> {
        try {
            // Check if instance exists by checking metadata
            const metadata = await this.getInstanceMetadata(instanceId);
            if (!metadata) {
                return {
                    success: false,
                    pending: false,
                    error: `Instance ${instanceId} not found`
                };
            }
            
            let isHealthy = true;
            try {
                // Optionally check if process is still running
                if (metadata.processId) {
                    try {
                        const process = await this.getSandbox().getProcess(metadata.processId);
                        isHealthy = !!(process && process.status === 'running');
                    } catch {
                        isHealthy = false; // Process not found or not running
                    }
                }
            } catch {
                // No preview available
                isHealthy = false;
            }

            return {
                success: true,
                pending: false,
                message: isHealthy ? 'Instance is running normally' : 'Instance may have issues',
                previewURL: metadata.previewURL,
                tunnelURL: metadata.tunnelURL,
                processId: metadata.processId
            };
        } catch (error) {
            this.logger.error('getInstanceStatus', error, { instanceId });
            return {
                success: false,
                pending: false,
                error: `Failed to get instance status: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async shutdownInstance(instanceId: string): Promise<ShutdownResponse> {
        try {
            // Check if instance exists 
            const metadata = await this.getInstanceMetadata(instanceId);
            if (!metadata) {
                return {
                    success: false,
                    error: `Instance ${instanceId} not found`
                };
            }

            this.logger.info(`Shutting down instance: ${instanceId}`);

            const sandbox = this.getSandbox();

            // Kill all processes
            const processes = await sandbox.listProcesses();
            for (const process of processes) {
                await sandbox.killProcess(process.id);
            }
            
            // Unexpose the allocated port if we know what it was
            if (metadata.allocatedPort) {
                try {
                    await sandbox.unexposePort(metadata.allocatedPort);
                    this.logger.info(`Unexposed port ${metadata.allocatedPort} for instance ${instanceId}`);
                } catch (error) {
                    this.logger.warn(`Failed to unexpose port ${metadata.allocatedPort}`, error);
                }
            } else {
                // Fallback: try to unexpose all exposed ports
                try {
                    const exposedPorts = await sandbox.getExposedPorts('localhost');
                    for (const port of exposedPorts) {
                        await sandbox.unexposePort(port.port);
                    }
                } catch {
                    // Ports may not be exposed
                }
            }
            
            // Clean up files
            await sandbox.exec('rm -rf /app/*');

            // Invalidate cache since instance is being shutdown
            this.invalidateMetadataCache(instanceId);

            return {
                success: true,
                message: `Successfully shutdown instance ${instanceId}`
            };
        } catch (error) {
            this.logger.error('shutdownInstance', error, { instanceId });
            return {
                success: false,
                error: `Failed to shutdown instance: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ==========================================
    // FILE OPERATIONS
    // ==========================================

    async writeFiles(instanceId: string, files: WriteFilesRequest['files']): Promise<WriteFilesResponse> {
        try {
            const sandbox = this.getSandbox();

            const results = [];

            const writePromises = files.map(file => {
                return sandbox.writeFile(`${instanceId}/${file.file_path}`, file.file_contents);
            });
            
            const writeResults = await Promise.all(writePromises);
            
            for (const writeResult of writeResults) {
                if (writeResult.success) {
                    results.push({
                        file: writeResult.path,
                        success: true
                    });
                    
                    this.logger.info(`Successfully wrote file: ${writeResult.path}`);
                } else {
                    this.logger.error(`Failed to write file: ${writeResult.path}`);
                    results.push({
                        file: writeResult.path,
                        success: false,
                        error: 'Unknown error'
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            return {
                success: true,
                results,
                message: `Successfully wrote ${successCount}/${files.length} files`
            };
        } catch (error) {
            this.logger.error('writeFiles', error, { instanceId });
            return {
                success: false,
                results: files.map(f => ({ file: f.file_path, success: false, error: 'Instance error' })),
                error: `Failed to write files: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async getFiles(instanceId: string, filePaths?: string[], applyFilter: boolean = false): Promise<GetFilesResponse> {
        try {
            const sandbox = this.getSandbox();

            if (!filePaths) {
                // Read '.important_files.json' in instance directory
                const importantFiles = await sandbox.exec(`cd ${instanceId} && jq -r '.[]' .important_files.json | while read -r path; do if [ -d "$path" ]; then find "$path" -type f; elif [ -f "$path" ]; then echo "$path"; fi; done`);
                this.logger.info(`Read important files: stdout: ${importantFiles.stdout}, stderr: ${importantFiles.stderr}`);
                filePaths = importantFiles.stdout.split('\n').filter(path => path);
                if (!filePaths) {
                    return {
                        success: false,
                        files: [],
                        error: 'Failed to read important files'
                    };
                }
                this.logger.info(`Successfully read important files: ${filePaths}`);
                applyFilter = true;
            }

            let donttouchPaths: string[] = [];

            if (applyFilter) {
                // Read 'donttouch_files.json'
                const donttouchFiles = await sandbox.exec(`cd ${instanceId} && jq -r '.[]' donttouch_files.json | while read -r path; do if [ -d "$path" ]; then find "$path" -type f; elif [ -f "$path" ]; then echo "$path"; fi; done`);
                this.logger.info(`Read donttouch files: stdout: ${donttouchFiles.stdout}, stderr: ${donttouchFiles.stderr}`);
                donttouchPaths = donttouchFiles.stdout.split('\n').filter(path => path);
                if (!donttouchPaths) {
                    return {
                        success: false,
                        files: [],
                        error: 'Failed to read donttouch files'
                    };
                }
                this.logger.info(`Successfully read donttouch files: ${donttouchPaths}`);
            }

            const files = [];
            const errors = [];

            const readPromises = filePaths.map(async (filePath) => {
                try {
                    const result = await sandbox.readFile(`${instanceId}/${filePath}`);
                    return {
                        result,
                        filePath
                    };
                } catch (error) {
                    return {
                        result: null,
                        filePath,
                        error
                    };
                }
            });
        
            const readResults = await Promise.allSettled(readPromises);
        
            for (const readResult of readResults) {
                if (readResult.status === 'fulfilled') {
                    const { result, filePath } = readResult.value;
                    if (result && result.success) {
                        files.push({
                            file_path: filePath,
                            file_contents: applyFilter && donttouchPaths.includes(filePath) ? '[REDACTED]' : result.content
                        });
                        
                        this.logger.info(`Successfully read file: ${filePath}`);
                    } else {
                        this.logger.error(`Failed to read file: ${filePath}`);
                        errors.push({
                            file: filePath,
                            error: 'Failed to read file'
                        });
                    }
                } else {
                    this.logger.error(`Promise rejected for file read`);
                    errors.push({
                        file: 'unknown',
                        error: 'Promise rejected'
                    });
                }
            }

            return {
                success: true,
                files,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error) {
            this.logger.error('getFiles', error, { instanceId });
            return {
                success: false,
                files: [],
                error: `Failed to get files: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ==========================================
    // LOG RETRIEVAL
    // ==========================================
    async getLogs(instanceId: string, onlyRecent?: boolean): Promise<GetLogsResponse> {
        try {
            this.logger.info(`Getting logs for instance: ${instanceId}`);
            // Use CLI to get all logs and reset the file
            const cmd = `timeout 10s monitor-cli logs get -i ${instanceId} --format raw ${onlyRecent ? '--reset' : ''}`;
            const result = await this.executeCommand(instanceId, cmd, 15000);
            return {
                success: true,
                logs: {
                    stdout: result.stdout,
                    stderr: result.stderr,
                },
                error: undefined
            };
        } catch (error) {
            this.logger.error('getLogs', error, { instanceId });
            return {
                success: false,
                logs: {
                    stdout: '',
                    stderr: '',
                },
                error: `Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ==========================================
    // COMMAND EXECUTION
    // ==========================================

    async executeCommands(instanceId: string, commands: string[], timeout?: number): Promise<ExecuteCommandsResponse> {
        try {
            const results: CommandExecutionResult[] = [];
            
            for (const command of commands) {
                try {
                    const result = await this.executeCommand(instanceId, command, timeout);
                    
                    results.push({
                        command,
                        success: result.exitCode === 0,
                        output: result.stdout,
                        error: result.stderr || undefined,
                        exitCode: result.exitCode
                    });
                    
                    // Track errors if command failed
                    if (result.exitCode !== 0) {
                        const error: RuntimeError = {
                            timestamp: new Date(),
                            message: `Command failed: ${command}`,
                            stack: result.stderr,
                            severity: 'error',
                            source: 'command_execution',
                            rawOutput: `Command: ${command}\nExit code: ${result.exitCode}\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`
                        };
                        await this.storeRuntimeError(instanceId, error);
                    }
                    
                    this.logger.info(`Executed command: ${command} (exit: ${result.exitCode})`);
                } catch (error) {
                    this.logger.error(`Command execution failed: ${command}`, error);
                    results.push({
                        command,
                        success: false,
                        output: '',
                        error: error instanceof Error ? error.message : 'Execution error'
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            return {
                success: true,
                results,
                message: `Executed ${successCount}/${commands.length} commands successfully`
            };
        } catch (error) {
            this.logger.error('executeCommands', error, { instanceId });
            return {
                success: false,
                results: commands.map(cmd => ({
                    command: cmd,
                    success: false,
                    output: '',
                    error: 'Instance error'
                })),
                error: `Failed to execute commands: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ==========================================
    // ERROR MANAGEMENT
    // ==========================================

    async getInstanceErrors(instanceId: string, clear?: boolean): Promise<RuntimeErrorResponse> {
        try {
            let errors: RuntimeError[] = [];
            const cmd = `timeout 3s monitor-cli errors list -i ${instanceId} --format json`;
            const result = await this.executeCommand(instanceId, cmd, 15000);
            
            if (result.exitCode === 0) {
                let response: any;
                try {
                    response = JSON.parse(result.stdout);
                    this.logger.info('getInstanceErrors', result.stdout);
                } catch (parseError) {
                    this.logger.warn('Failed to parse CLI output as JSON', { stdout: result.stdout });
                    throw new Error('Invalid JSON response from CLI tools');
                }
                if (response.success && response.errors) {
                    // Convert StoredError objects to RuntimeError format
                    // CLI returns StoredError objects with snake_case field names
                    errors = response.errors.map((err: Record<string, unknown>) => ({
                        timestamp: err.last_occurrence || err.created_at,
                        message: String(err.message || ''),
                        // stack: err.stack_trace ? String(err.stack_trace) : undefined, // Commented out to save memory
                        // source: undefined, // Commented out - not needed for now
                        filePath: err.source_file ? String(err.source_file) : undefined,
                        lineNumber: typeof err.line_number === 'number' ? err.line_number : undefined,
                        columnNumber: typeof err.column_number === 'number' ? err.column_number : undefined,
                        severity: this.mapSeverityToLegacy(String(err.severity || 'error')),
                        rawOutput: err.raw_output ? String(err.raw_output) : undefined
                    }));

                    // Auto-clear if requested
                    if (clear && errors.length > 0) {
                        this.clearInstanceErrors(instanceId);   // Call in the background
                    }

                    return {
                        success: true,
                        errors,
                        hasErrors: errors.length > 0
                    };
                }
            } 
            this.logger.error(`Failed to get errors for instance ${instanceId}: STDERR: ${result.stderr}, STDOUT: ${result.stdout}`);

            return {
                success: false,
                errors: [],
                hasErrors: false,
                error: `Failed to get errors for instance ${instanceId}: STDERR: ${result.stderr}, STDOUT: ${result.stdout}`
            };
        } catch (error) {
            this.logger.error('getInstanceErrors', error, { instanceId });
            return {
                success: false,
                errors: [],
                hasErrors: false,
                error: `Failed to get errors: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async clearInstanceErrors(instanceId: string): Promise<ClearErrorsResponse> {
        try {
            let clearedCount = 0;

            // Try enhanced error system first - clear ALL errors
            try {
                const cmd = `timeout 10s monitor-cli errors clear -i ${instanceId} --confirm`;
                const result = await this.executeCommand(instanceId, cmd, 15000); // 15 second timeout
                
                if (result.exitCode === 0) {
                    let response: any;
                    try {
                        response = JSON.parse(result.stdout);
                    } catch (parseError) {
                        this.logger.warn('Failed to parse CLI output as JSON', { stdout: result.stdout });
                        throw new Error('Invalid JSON response from CLI tools');
                    }
                    if (response.success) {
                        return {
                            success: true,
                            message: response.message || `Cleared ${response.clearedCount || 0} errors`
                        };
                    }
                }
            } catch (enhancedError) {
                this.logger.warn('Enhanced error clearing unavailable, falling back to legacy', enhancedError);
            }

            // Fallback to legacy error system
            const sandbox = this.getSandbox();
            try {
                const errorsFile = await sandbox.readFile(this.getRuntimeErrorFile(instanceId));
                const errors = JSON.parse(errorsFile.content) as RuntimeError[];
                clearedCount = errors.length;
                
                // Clear errors by writing empty array
                await sandbox.writeFile(this.getRuntimeErrorFile(instanceId), JSON.stringify([]));
            } catch {
                // No errors to clear
            }

            this.logger.info(`Cleared ${clearedCount} errors for instance ${instanceId}`);

            return {
                success: true,
                message: `Cleared ${clearedCount} errors`
            };
        } catch (error) {
            this.logger.error('clearInstanceErrors', error, { instanceId });
            return {
                success: false,
                error: `Failed to clear errors: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    // ==========================================
    // CODE ANALYSIS & FIXING
    // ==========================================

    async runStaticAnalysisCode(instanceId: string): Promise<StaticAnalysisResponse> {
        try {
            const lintIssues: CodeIssue[] = [];
            const typecheckIssues: CodeIssue[] = [];
            
            // Run ESLint and TypeScript check in parallel
            const [lintResult, tscResult] = await Promise.allSettled([
                this.executeCommand(instanceId, 'bun run lint'),
                this.executeCommand(instanceId, 'bunx tsc -b --incremental --noEmit --pretty false')
            ]);

            const results: StaticAnalysisResponse = {
                success: true,
                lint: {
                    issues: [],
                    summary: {
                        errorCount: 0,
                        warningCount: 0,
                        infoCount: 0
                    },
                    rawOutput: ''
                },
                typecheck: {
                    issues: [],
                    summary: {
                        errorCount: 0,
                        warningCount: 0,
                        infoCount: 0
                    },
                    rawOutput: ''
                }
            };
            
            // Process ESLint results
            if (lintResult.status === 'fulfilled') {
                try {
                    const lintData = JSON.parse(lintResult.value.stdout) as Array<{
                        filePath: string;
                        messages: Array<{
                            message: string;
                            line?: number;
                            column?: number;
                            severity: number;
                            ruleId?: string;
                        }>;
                    }>;
                    
                    for (const fileResult of lintData) {
                        for (const message of fileResult.messages || []) {
                            lintIssues.push({
                                message: message.message,
                                filePath: fileResult.filePath,
                                line: message.line || 0,
                                column: message.column,
                                severity: this.mapESLintSeverity(message.severity),
                                ruleId: message.ruleId,
                                source: 'eslint'
                            });
                        }
                    }
                } catch (error) {
                    this.logger.warn('Failed to parse ESLint output', error);
                }

                results.lint.issues = lintIssues;
                results.lint.summary = {
                    errorCount: lintIssues.filter(issue => issue.severity === 'error').length,
                    warningCount: lintIssues.filter(issue => issue.severity === 'warning').length,
                    infoCount: lintIssues.filter(issue => issue.severity === 'info').length
                };
                results.lint.rawOutput = `STDOUT: ${lintResult.value.stdout}\nSTDERR: ${lintResult.value.stderr}`;
            } else if (lintResult.status === 'rejected') {
                this.logger.warn('ESLint analysis failed', lintResult.reason);
            }
            
            // Process TypeScript check results
            if (tscResult.status === 'fulfilled') {
                try {
                    // TypeScript errors can come from either stdout or stderr
                    const output = tscResult.value.stderr || tscResult.value.stdout;
                    
                    if (!output || output.trim() === '') {
                        this.logger.info('No TypeScript output to parse');
                    } else {
                        this.logger.info(`Parsing TypeScript output: ${output.substring(0, 200)}...`);
                        
                        // Split by lines and parse each error
                        const lines = output.split('\n');
                        let currentError: any = null;
                        
                        for (const line of lines) {
                            // Match TypeScript error format: path(line,col): error TSxxxx: message
                            const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
                            if (match) {
                                // If we have a previous error being built, add it
                                if (currentError) {
                                    typecheckIssues.push(currentError);
                                }
                                
                                // Start building new error
                                currentError = {
                                    message: match[5].trim(),
                                    filePath: match[1].trim(),
                                    line: parseInt(match[2]),
                                    column: parseInt(match[3]),
                                    severity: 'error' as const,
                                    source: 'typescript',
                                    ruleId: `TS${match[4]}`
                                };
                                
                                this.logger.info(`Found TypeScript error: ${currentError.filePath}:${currentError.line} - ${currentError.ruleId}`);
                            } else if (currentError && line.trim() && !line.startsWith('src/') && !line.includes(': error TS')) {
                                // This might be a continuation of the error message
                                currentError.message += ' ' + line.trim();
                            }
                        }
                        
                        // Add the last error if it exists
                        if (currentError) {
                            typecheckIssues.push(currentError);
                        }
                        
                        this.logger.info(`Parsed ${typecheckIssues.length} TypeScript errors`);
                    }
                } catch (error) {
                    this.logger.warn('Failed to parse TypeScript output', error);
                }
                
                results.typecheck.issues = typecheckIssues;
                results.typecheck.summary = {
                    errorCount: typecheckIssues.filter(issue => issue.severity === 'error').length,
                    warningCount: typecheckIssues.filter(issue => issue.severity === 'warning').length,
                    infoCount: typecheckIssues.filter(issue => issue.severity === 'info').length
                };
                results.typecheck.rawOutput = `STDOUT: ${tscResult.value.stdout}\nSTDERR: ${tscResult.value.stderr}`;
            } else if (tscResult.status === 'rejected') {
                this.logger.warn('TypeScript analysis failed', tscResult.reason);
            }

            this.logger.info(`Analysis completed: ${lintIssues.length} lint issues, ${typecheckIssues.length} typecheck issues`);

            return {
                ...results
            };
        } catch (error) {
            this.logger.error('runStaticAnalysisCode', error, { instanceId });
            return {
                success: false,
                lint: { issues: [] },
                typecheck: { issues: [] },
                error: `Failed to run analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async fixCodeIssues(instanceId: string, allFiles?: FileObject[]): Promise<CodeFixResult> {
        try {
            this.logger.info(`Fixing code issues for ${instanceId}`);
            // First run static analysis
            const analysisResult = await this.runStaticAnalysisCode(instanceId);
            this.logger.info(`Static analysis completed for ${instanceId}`);
            // Then get all the files
            const files = allFiles || (await this.getFiles(instanceId)).files;
            this.logger.info(`Files retrieved for ${instanceId}`);
            
            // Create file fetcher callback
            const fileFetcher: FileFetcher = async (filePath: string) => {
                // Fetch a single file from the instance
                try {
                    const result = await this.getSandbox().readFile(`${instanceId}/${filePath}`);
                    if (result.success) {
                        this.logger.info(`Successfully fetched file: ${filePath}`);
                        return {
                            file_path: filePath,
                            file_contents: result.content,
                            file_purpose: `Fetched file: ${filePath}`
                        };
                    } else {
                        this.logger.debug(`File not found: ${filePath}`);
                    }
                } catch (error) {
                    this.logger.debug(`Failed to fetch file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                return null;
            };

            // Use the new functional API
            const fixResult = await fixProjectIssues(
                files.map(file => ({
                    file_path: file.file_path,
                    file_contents: file.file_contents,
                    file_purpose: ''
                })),
                analysisResult.typecheck.issues,
                fileFetcher
            );
            fixResult.modifiedFiles.forEach((file: FileObject) => {
                this.getSandbox().writeFile(`${instanceId}/${file.file_path}`, file.file_contents);
            });
            this.logger.info(`Code fix completed for ${instanceId}`);
            return fixResult;
        } catch (error) {
            this.logger.error('fixCodeIssues', error, { instanceId });
            return {
                fixedIssues: [],
                unfixableIssues: [],
                modifiedFiles: []
            };
        }
    }

    private mapESLintSeverity(severity: number): LintSeverity {
        switch (severity) {
            case 1: return 'warning';
            case 2: return 'error';
            default: return 'info';
        }
    }

    // ==========================================
    // DEPLOYMENT
    // ==========================================

    async deployToCloudflareWorkers(instanceId: string): Promise<DeploymentResult> {
        try {
            const base64Data = await this.packInstance(instanceId, true);
            return deployToCloudflareWorkers({
                instanceId,
                base64encodedArchive: base64Data,
                logger: this.logger,
                projectName: this.metadataCache.get(instanceId)?.projectName || '',
                hostname: this.hostname
            });
            
        } catch (error) {
            this.logger.error('deployToCloudflareWorkers', error, { instanceId });
            return {
                success: false,
                message: `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // ==========================================
    // GITHUB INTEGRATION
    // ==========================================

    async initGitHubRepository(instanceId: string, request: GitHubInitRequest): Promise<GitHubInitResponse> {
        try {

            // Initialize git repository
            const initResult = await this.executeCommand(instanceId, `git init && git add . && git commit -m "Initial commit"`);
            
            if (initResult.exitCode !== 0) {
                throw new Error(`Git initialization failed: ${initResult.stderr}`);
            }
            
            // Create GitHub repository using GitHub API
            const repoResponse = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${request.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: request.repositoryName,
                    description: request.description,
                    private: request.isPrivate || false
                })
            });
            
            if (!repoResponse.ok) {
                const error = await repoResponse.text();
                throw new Error(`GitHub API error: ${error}`);
            }
            
            const repoData = await repoResponse.json() as {
                html_url: string;
                clone_url: string;
            };
            
            // Configure git with token authentication and add remote
            const gitConfigResult = await this.executeCommand(instanceId, `git config user.email "${request.email}" && git config user.name "${request.username}" && git remote add origin https://${request.token}@github.com/${request.username}/${request.repositoryName}.git`);
            
            if (gitConfigResult.exitCode !== 0) {
                throw new Error(`Git config failed: ${gitConfigResult.stderr}`);
            }
            
            // Push with authentication
            const pushResult = await this.executeCommand(instanceId, `git push -u origin main`);
            
            if (pushResult.exitCode !== 0) {
                throw new Error(`Git push failed: ${pushResult.stderr}`);
            }
            
            this.logger.info(`Successfully initialized GitHub repository: ${repoData.html_url}`);
            
            return {
                success: true,
                repositoryUrl: repoData.html_url,
                cloneUrl: repoData.clone_url
            };
        } catch (error) {
            this.logger.error('initGitHubRepository', error, { instanceId });
            throw new Error(`GitHub repository initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async pushToGitHub(instanceId: string, request: GitHubPushRequest): Promise<GitHubPushResponse> {
        try {

            // Add, commit, and push changes with proper error handling
            const addResult = await this.executeCommand(instanceId, `git add .`);
            if (addResult.exitCode !== 0) {
                throw new Error(`Git add failed: ${addResult.stderr}`);
            }
            
            const commitResult = await this.executeCommand(instanceId, `git commit -m "${request.commitMessage.replace(/"/g, '\\"')}"`);
            if (commitResult.exitCode !== 0) {
                throw new Error(`Git commit failed: ${commitResult.stderr}`);
            }
            
            const pushResult = await this.executeCommand(instanceId, `git push`);
            
            if (pushResult.exitCode !== 0) {
                throw new Error(`Git push failed: ${pushResult.stderr}`);
            }
            
            this.logger.info(`Successfully pushed to GitHub for instance ${instanceId}`);
            
            return {
                success: true,
                commitSha: 'unknown' // Would need to parse from git output
            };
        } catch (error) {
            this.logger.error('pushToGitHub', error, { instanceId });
            throw new Error(`GitHub push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ==========================================
    // SAVE/RESUME OPERATIONS
    // ==========================================

    async packInstance(instanceId: string, build: boolean = true): Promise<string> {
        const archiveName = `${instanceId}.zip`;
        const sandbox = this.getSandbox();
            
        if (build) {
            const buildResult = await this.executeCommand(instanceId, 'bun run build');
            if (buildResult.exitCode !== 0) {
                this.logger.warn('Build step failed or not available', buildResult.stdout, buildResult.stderr);
                throw new Error(`Build failed: ${buildResult.stderr}`);
            }
        }

        // Create zip archive excluding large directories for speed
        // -0: no compression (fastest)
        // -r: recursive
        // -q: quiet (less output overhead)
        // -x: exclude patterns
        const zipCmd = `zip -6 -r -q ${archiveName} ${instanceId}/ ${instanceId}-metadata.json ${instanceId}-runtime_errors.json -x "data/*" "*/node_modules/*" "*/.cache/*" "*/.git/*" "*/.vscode/*" "*/coverage/*" "*/.nyc_output/*" "*/tmp/*" "*/temp/*" || true`;
        const zipResult = await sandbox.exec(zipCmd);

        if (zipResult.exitCode !== 0) {
            throw new Error(`Failed to create zip archive: ${zipResult.stderr}`);
        }

        // Convert zip file to base64 for proper binary handling
        const base64Result = await sandbox.exec(`base64 -w 0 ${archiveName} && rm ${archiveName}`);
        if (base64Result.exitCode !== 0) {
            throw new Error('Failed to encode zip file to base64');
        }

        return base64Result.stdout.trim();
    }

    async saveInstance(instanceId: string, buildBeforeSave: boolean = true): Promise<SaveInstanceResponse> {
        try {
            this.logger.info(`Saving instance ${instanceId} to R2 bucket`);

            // Check if instance exists
            const metadata = await this.getInstanceMetadata(instanceId);
            if (!metadata) {
                return {
                    success: false,
                    error: `Instance ${instanceId} not found`
                };
            }
            // Create archive name based on instance details
            const compressionStart = Date.now();
            const compressionTime = Date.now() - compressionStart;
            this.logger.info(`Zipped instance ${instanceId} in ${compressionTime}ms`);

            // Upload to R2 bucket using PUT request
            const uploadStart = Date.now();
            
            // Decode base64 back to binary for R2 upload
            const base64Content = await this.packInstance(instanceId, buildBeforeSave);
            const binaryBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));

            const uploadResponse = await env.TEMPLATES_BUCKET.put(`instances/${instanceId}.zip`, binaryBuffer);

            if (!uploadResponse) {
                throw new Error(`Failed to upload to R2`);
            }

            const uploadTime = Date.now() - uploadStart;

            // Cleanup local archive
            // await sandbox.exec(`rm -f ${archiveName}`);

            this.logger.info(`Successfully saved instance ${instanceId} (compression: ${compressionTime}ms, upload: ${uploadTime}ms), Object: ${uploadResponse}`);

            return {
                success: true,
                message: `Successfully saved instance ${instanceId}`,
                compressionTime,
                uploadTime
            };

        } catch (error) {
            this.logger.error('saveInstance', error, { instanceId });
            return {
                success: false,
                error: `Failed to save instance: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async resumeInstance(instanceId: string, forceRestart?: boolean): Promise<ResumeInstanceResponse> {
        try {
            this.logger.info(`Resuming instance ${instanceId}`, { forceRestart });
            
            const sandbox = this.getSandbox();
            let needsDownload = false;
            let needsStart = false;

            // Check if instance exists locally  
            let metadata = await this.getInstanceMetadata(instanceId);
            
            if (!metadata) {
                this.logger.info(`Instance ${instanceId} not found locally, will download from R2`);
                needsDownload = true;
                needsStart = true;
            } else {
                // Instance exists, check process status
                if (!metadata.processId || forceRestart) {
                    this.logger.info(`Instance ${instanceId} has no process or force restart requested`);
                    needsStart = true;
                } else {
                    // Check if process is still running
                    try {
                        const process = await sandbox.getProcess(metadata.processId);
                        if (!process || process.status !== 'running') {
                            this.logger.info(`Instance ${instanceId} process ${metadata.processId} is not running`);
                            needsStart = true;
                        } else {
                            this.logger.info(`Instance ${instanceId} is already running with process ${metadata.processId}`);
                            return {
                                success: true,
                                message: `Instance ${instanceId} is already running`,
                                resumed: false,
                                previewURL: metadata.previewURL,
                                processId: metadata.processId
                            };
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to check process ${metadata.processId}, will restart`, error);
                        needsStart = true;
                    }
                }
            }

            let downloadTime = 0;
            let setupTime = 0;

            // Download from R2 if needed using existing ensureTemplateExists function
            if (needsDownload) {
                const downloadStart = Date.now();
                
                this.logger.info(`Downloading instance ${instanceId} using ensureTemplateExists`);
                
                // Use the existing ensureTemplateExists function which handles zip download and extraction
                await this.ensureTemplateExists(instanceId, "instances", true);

                downloadTime = Date.now() - downloadStart;
                this.logger.info(`Downloaded and extracted instance ${instanceId} in ${downloadTime}ms`);

                // Re-read metadata after extraction
                const extractedMetadata = await this.getInstanceMetadata(instanceId);
                if (extractedMetadata) {
                    metadata = extractedMetadata;
                }
            }

            // Start process if needed
            if (needsStart) {
                const setupStart = Date.now();

                // Install dependencies and start dev server (reuse existing logic)
                const setupResult = await this.setupInstance(instanceId, metadata?.projectName || instanceId);
                
                if (!setupResult) {
                    throw new Error('Failed to setup instance');
                }

                // Update metadata with new process info
                const updatedMetadata = {
                    ...metadata,
                    templateName: metadata?.templateName || 'unknown',
                    projectName: metadata?.projectName || instanceId,
                    startTime: new Date().toISOString(),
                    previewURL: setupResult.previewURL,
                    processId: setupResult.processId,
                    tunnelURL: setupResult.tunnelURL,
                    allocatedPort: setupResult.allocatedPort
                };

                await this.storeInstanceMetadata(instanceId, updatedMetadata);

                setupTime = Date.now() - setupStart;
                this.logger.info(`Started instance ${instanceId} in ${setupTime}ms`);

                return {
                    success: true,
                    message: `Successfully resumed instance ${instanceId}`,
                    resumed: true,
                    previewURL: setupResult.previewURL,
                    tunnelURL: setupResult.tunnelURL,
                    processId: setupResult.processId
                };
            }

            return {
                success: true,
                message: `Instance ${instanceId} was already running`,
                resumed: false,
                previewURL: metadata?.previewURL,
                processId: metadata?.processId
            };

        } catch (error) {
            this.logger.error('resumeInstance', error, { instanceId, forceRestart });
            return {
                success: false,
                resumed: false,
                error: `Failed to resume instance: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async *executeStream(instanceId: string, command: string): AsyncIterable<StreamEvent> {
        try {
            const sandbox = this.getSandbox();

            const fullCommand = `cd ${instanceId} && ${command}`;
            
            this.logger.info(`Starting streaming execution: ${command}`);
            
            const stream = await sandbox.execStream(fullCommand);
            
            for await (const event of parseSSEStream<ExecEvent>(stream)) {
                const streamEvent: StreamEvent = {
                    type: 'stdout', // Default type
                    timestamp: new Date()
                };
                
                switch (event.type) {
                    case 'start':
                        streamEvent.type = 'stdout';
                        streamEvent.data = 'Command started';
                        break;
                    case 'stdout':
                        streamEvent.type = 'stdout';
                        streamEvent.data = event.data;
                        break;
                    case 'stderr':
                        streamEvent.type = 'stderr';
                        streamEvent.data = event.data;
                        break;
                    case 'complete':
                        streamEvent.type = 'exit';
                        streamEvent.code = event.exitCode;
                        break;
                    case 'error':
                        streamEvent.type = 'error';
                        streamEvent.error = event.error;
                        break;
                    default:
                        streamEvent.type = 'error';
                        streamEvent.error = `Unknown event type: ${event.type}`;
                }
                
                yield streamEvent;
            }
        } catch (error) {
            yield {
                type: 'error',
                error: error instanceof Error ? error.message : 'Streaming execution failed',
                timestamp: new Date()
            };
        }
    }

    async exposePort(instanceId: string, port: number): Promise<string> {
        try {
            const sandbox = this.getSandbox();
            const preview = await sandbox.exposePort(port, { hostname: this.hostname, name: instanceId });
            this.logger.info(`Exposed port ${port} for instance ${instanceId}`, { url: preview.url });
            return preview.url;
        } catch (error) {
            this.logger.error('exposePort', error, { instanceId, port });
            throw new Error(`Failed to expose port: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async gitCheckout(instanceId: string, repository: string, branch?: string): Promise<void> {
        try {
            const sandbox = this.getSandbox();
            const result = await sandbox.gitCheckout(repository, {
                branch: branch || 'main',
                targetDir: 'project'
            });
            
            if (!result.success) {
                throw new Error(`Git checkout failed: ${result.stderr}`);
            }
            
            this.logger.info(`Successfully checked out ${repository}`, { branch, targetDir: result.targetDir });
        } catch (error) {
            this.logger.error('gitCheckout', error, { instanceId, repository, branch });
            throw new Error(`Failed to checkout repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Map enhanced severity levels to legacy format for backward compatibility
     */
    private mapSeverityToLegacy(severity: string): 'warning' | 'error' | 'fatal' {
        switch (severity) {
            case 'fatal':
                return 'fatal';
            case 'error':
                return 'error';
            case 'warning':
            case 'info':
            default:
                return 'warning';
        }
    }

    /**
     * Generate JWT token for templates gateway authentication using existing TokenService
     */
    private async generateTemplatesGatewayToken(sessionId: string, instanceId: string): Promise<string> {
        const tokenService = new TokenService(env);
        
        // Create JWT token with custom payload for templates gateway
        const token = await tokenService.createToken(
            {
                sub: sessionId, // Use sessionId as subject
                email: `sandbox-${sessionId}@templates.gateway`, // Dummy email for TokenService compatibility
                type: 'access' as const,
                sessionId: sessionId,
                jti: instanceId // Use jti field to store instanceId for validation
            },
            86400 // 24 hours in seconds
        );
        
        this.logger.info('Generated JWT token for templates gateway authentication');
        return token;
    }

    /**
     * Register JWT token in KV for authentication
     */
    private async registerAuthToken(jwtToken: string, instanceId: string): Promise<void> {
        try {
            const kvKey = `agent-orangebuild-${jwtToken}`;
            await env.INSTANCE_REGISTRY.put(
                kvKey,
                instanceId,
                { expirationTtl: 86400 } // 24 hours TTL
            );
            this.logger.info('Registered JWT token in KV registry', { instanceId });
        } catch (error) {
            this.logger.error('Failed to register JWT token in KV registry', error);
            throw new Error('Failed to register authentication token');
        }
    }

    /**
     * Set authentication environment variables for sandbox
     */
    private async setAuthEnvironmentVariables(jwtToken: string): Promise<void> {
        const authEnvVars = {
            CF_AI_API_KEY: jwtToken,
            CF_AI_BASE_URL: env.TEMPLATES_GATEWAY_URL || 'https://templates.coder.eti-india.workers.dev'
        };
        
        // Merge with existing environment variables
        const combinedEnvVars = { ...this.envVars, ...authEnvVars };
        
        // Set the combined environment variables on the sandbox
        this.getSandbox().setEnvVars(combinedEnvVars);
        this.logger.info('Set authentication environment variables for sandbox', {
            CF_AI_BASE_URL: authEnvVars.CF_AI_BASE_URL,
            hasApiKey: !!authEnvVars.CF_AI_API_KEY
        });
        
        // Update the instance's envVars for future use
        this.envVars = combinedEnvVars;
    }
}