
import { proxyToSandbox } from "@cloudflare/sandbox";
import { Hono } from 'hono';
import { SandboxSdkClient } from './sandbox/sandboxSdkClient';
import { 
  BootstrapRequestSchema, 
  WriteFilesRequestSchema, 
  ExecuteCommandsRequestSchema,
  DeploymentCredentialsSchema,
  GitHubExportRequest,
  GitHubPushRequest
} from './sandbox/sandboxTypes';
import { createLogger } from "./logger";
import { getPreviewDomain } from "./utils/urls";

// Export the Sandbox class in your Worker
export { Sandbox as UserAppSandboxService, Sandbox as DeployerService, Sandbox} from "@cloudflare/sandbox";


async function getClientForSession(c: any, envVars?: Record<string, string>): Promise<SandboxSdkClient> {
  const sessionId = c.req.header('x-session-id') || 'default-session';
  const url = new URL(c.req.raw.url);
  const hostname = url.hostname === 'localhost' ? `localhost:${url.port}`: url.hostname;
    console.log('Session ID:', sessionId, 'Hostname:', hostname, 'Env Vars:', envVars);
    
    const client = new SandboxSdkClient(sessionId);
    await client.initialize();
    return client;
}

// Template controllers
const templateController = {
  async listTemplates(c: any) {
    try {
      const response = await SandboxSdkClient.listTemplates();
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to list templates: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getTemplateDetails(c: any) {
    try {
      const templateName = c.req.param('name');
      const client = await getClientForSession(c);
      const response = await client.getTemplateDetails(templateName);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get template details: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  }
};

// Process controllers
const processController = {
  async bootstrap(c: any) {
    try {
      const body = await c.req.json();
      const validatedBody = BootstrapRequestSchema.parse(body);
      const client = await getClientForSession(c, validatedBody.envVars);
      
      const response = await client.createInstance(
        validatedBody.templateName,
        validatedBody.projectName,
        validatedBody.webhookUrl,
      );
      
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to bootstrap instance: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async listAllInstances(c: any) {
    try {
      const client = await getClientForSession(c);
      const response = await client.listAllInstances();
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        instances: [],
        count: 0,
        error: `Failed to list instances: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getInstanceDetails(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.getInstanceDetails(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get instance details: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getTemplateBootstrapStatus(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.getInstanceStatus(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get bootstrap status: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getFiles(c: any) {
    try {
      const instanceId = c.req.param('id');
      const filePaths = c.req.query('filePaths') ? JSON.parse(c.req.query('filePaths')) : undefined;
      const client = await getClientForSession(c);
      const response = await client.getFiles(instanceId, filePaths);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get files: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async writeFiles(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      console.log("Body", body);
      const validatedBody = WriteFilesRequestSchema.parse(body);
      const client = await getClientForSession(c);
      const response = await client.writeFiles(instanceId, validatedBody.files, validatedBody.commitMessage);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to write files: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async shutdown(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.shutdownInstance(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to shutdown instance: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getRunningTemplateDetails(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      
      // Get instance details first to find template name
      const instanceResponse = await client.getInstanceDetails(instanceId);
      if (!instanceResponse.success || !instanceResponse.instance) {
        return c.json({
          success: false,
          error: "Instance not found or failed to get details"
        }, 404);
      }
      
      const templateResponse = await client.getTemplateDetails(instanceResponse.instance.templateName);
      return c.json(templateResponse);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get template details: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async executeCommandsInInstance(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const validatedBody = ExecuteCommandsRequestSchema.parse(body);
      const client = await getClientForSession(c);
      const response = await client.executeCommands(instanceId, validatedBody.commands, validatedBody.timeout);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to execute commands: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async detectErrors(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.getInstanceErrors(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to detect errors: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async clearErrors(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.clearInstanceErrors(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to clear errors: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async analyzeCode(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.runStaticAnalysisCode(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to analyze code: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async fixCodeIssues(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.fixCodeIssues(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to fix code issues: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getLogs(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.getLogs(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },
};

// Deployment controllers
const deploymentController = {
  async deployInstance(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const credentials = body.credentials ? DeploymentCredentialsSchema.parse(body.credentials) : undefined;
      const client = await getClientForSession(c);
      const response = await client.deployToCloudflareWorkers(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to deploy instance: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async getInstanceDeploymentInfo(c: any) {
    // This would require storing deployment information, which isn't implemented yet
    return c.json({
      success: false,
      error: "Getting deployment info is not yet implemented"
    }, 501);
  }
};

// GitHub controllers
const githubController = {
  async exportToGitHub(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const validatedBody = body as GitHubExportRequest;
      const client = await getClientForSession(c);
      const response = await client.exportToGitHub(instanceId, validatedBody);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to export to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },
  async pushToGitHub(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const validatedBody = body as GitHubPushRequest;
      const client = await getClientForSession(c);
      const response = await client.pushToGitHub(instanceId, validatedBody);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to push to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  }
};

const app = new Hono<{ Bindings: Env }>();

// Auth middleware - simple token-based authentication
app.use('*', async (c, next) => {
  const authToken = c.req.header('Authorization')?.replace('Bearer ', '');
  const expectedToken = c.env.AUTH_TOKEN;
  
  if (!expectedToken) {
    // Skip auth if no token is configured
    return next();
  }
  
  if (!authToken || authToken !== expectedToken) {
    return c.json({ 
      success: false, 
      error: 'Unauthorized - Invalid or missing auth token' 
    }, 401);
  }
  
  return next();
});

// Template routes
app.get('/templates', templateController.listTemplates);
app.get('/templates/:name', templateController.getTemplateDetails);

// Instance routes
app.post('/instances', processController.bootstrap);
app.get('/instances', processController.listAllInstances);
app.get('/instances/:id', processController.getInstanceDetails);
app.get('/instances/:id/status', processController.getTemplateBootstrapStatus);
app.get('/instances/:id/files', processController.getFiles);
app.post('/instances/:id/files', processController.writeFiles);
app.delete('/instances/:id', processController.shutdown);
app.get('/instances/:id/template', processController.getRunningTemplateDetails);
app.post('/instances/:id/commands', processController.executeCommandsInInstance);
app.get('/instances/:id/errors', processController.detectErrors);
app.delete('/instances/:id/errors', processController.clearErrors);
app.get('/instances/:id/analysis', processController.analyzeCode);
app.get('/instances/:id/logs', processController.getLogs);
app.post('/instances/:id/code-fix', processController.fixCodeIssues);

// Deployment routes
app.post('/instances/:id/deploy', deploymentController.deployInstance);
app.get('/instances/:id/deploy', deploymentController.getInstanceDeploymentInfo);

// GitHub integration routes
app.post('/instances/:id/github/export', githubController.exportToGitHub);
app.post('/instances/:id/github/push', githubController.pushToGitHub);

// Logger for the main application and handlers
const logger = createLogger('App');

/**
 * Handles requests for user-deployed applications on subdomains.
 * It first attempts to proxy to a live development sandbox. If that fails,
 * it dispatches the request to a permanently deployed worker via namespaces.
 * This function will NOT fall back to the main worker.
 *
 * @param request The incoming Request object.
 * @param env The environment bindings.
 * @returns A Response object from the sandbox, the dispatched worker, or an error.
 */
async function handleUserAppRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const { hostname } = url;
	logger.info(`Handling user app request for: ${hostname}`);

	// 1. Attempt to proxy to a live development sandbox.
	// proxyToSandbox doesn't consume the request body on a miss, so no clone is needed here.
	const sandboxResponse = await proxyToSandbox(request, env);
	if (sandboxResponse) {
		logger.info(`Serving response from sandbox for: ${hostname}`);
		return sandboxResponse;
	}

	// 2. If sandbox misses, attempt to dispatch to a deployed worker.
	logger.info(`Sandbox miss for ${hostname}, attempting dispatch to permanent worker.`);
	// Extract the app name (e.g., "xyz" from "xyz.build.cloudflare.dev").
	const appName = hostname.split('.')[0];
	const dispatcher = env['DISPATCHER'];

	try {
		const worker = dispatcher.get(appName);
		return await worker.fetch(request);
	} catch (error: any) {
		// This block catches errors if the binding doesn't exist or if worker.fetch() fails.
		logger.warn(`Error dispatching to worker '${appName}': ${error.message}`);
		return new Response('An error occurred while loading this application.', { status: 500 });
	}
}

/**
 * Main Worker fetch handler with robust, secure routing.
 */
const worker = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// --- Pre-flight Checks ---

		// 1. Critical configuration check: Ensure custom domain is set.
        const previewDomain = getPreviewDomain(env);
		if (!previewDomain || previewDomain.trim() === '') {
			console.error('FATAL: env.CUSTOM_DOMAIN is not configured in wrangler.toml or the Cloudflare dashboard.');
			return new Response('Server configuration error: Application domain is not set.', { status: 500 });
		}

		const url = new URL(request.url);
		const { hostname, pathname } = url;

		// 2. Security: Immediately reject any requests made via an IP address.
		const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
		if (ipRegex.test(hostname)) {
			return new Response('Access denied. Please use the assigned domain name.', { status: 403 });
		}

		// --- Domain-based Routing ---

		// Normalize hostnames for both local development (localhost) and production.
		const isMainDomainRequest =
			hostname === env.CUSTOM_DOMAIN || hostname === 'localhost';
		const isSubdomainRequest =
			hostname.endsWith(`.${previewDomain}`) ||
			(hostname.endsWith('.localhost') && hostname !== 'localhost');

		// Route 1: Main Platform Request (e.g., build.cloudflare.dev or localhost)
		if (isMainDomainRequest) {
            return app.fetch(request, env);
		}

		// Route 2: User App Request (e.g., xyz.build.cloudflare.dev or test.localhost)
		if (isSubdomainRequest) {
			return handleUserAppRequest(request, env);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export default worker;