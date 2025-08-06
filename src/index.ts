import { proxyToSandbox } from "@cloudflare/sandbox";
import { Hono } from 'hono';
import { SandboxSdkClient } from './sandboxSdkClient';
import { 
  BootstrapRequestSchema, 
  WriteFilesRequestSchema, 
  ExecuteCommandsRequestSchema,
  DeploymentCredentialsSchema,
  GitHubInitRequest,
  GitHubPushRequest,
  ResumeInstanceRequestSchema
} from './sandboxTypes';

// Export the Sandbox class in your Worker
export { Sandbox as UserAppSandboxService, Sandbox as DeployerService, Sandbox} from "@cloudflare/sandbox";


async function getClientForSession(c: any, envVars?: Record<string, string>): Promise<SandboxSdkClient> {
  const sessionId = c.req.header('x-session-id') || 'default-session';
  const hostname = new URL(c.req.raw.url).hostname;
    console.log('Session ID:', sessionId, 'Hostname:', hostname, 'Env Vars:', envVars);
    
    const client = new SandboxSdkClient(sessionId, hostname, envVars);
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
        validatedBody.wait
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
      const validatedBody = WriteFilesRequestSchema.parse(body);
      const client = await getClientForSession(c);
      const response = await client.writeFiles(instanceId, validatedBody.files);
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

  async saveInstance(c: any) {
    try {
      const instanceId = c.req.param('id');
      const client = await getClientForSession(c);
      const response = await client.saveInstance(instanceId);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to save instance: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async resumeInstance(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const validatedBody = ResumeInstanceRequestSchema.parse(body);
      const client = await getClientForSession(c);
      const response = await client.resumeInstance(instanceId, validatedBody.forceRestart);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        resumed: false,
        error: `Failed to resume instance: ${error instanceof Error ? error.message : 'Unknown error'}` 
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
  async initGitHubRepo(c: any) {
    try {
      const instanceId = c.req.param('id');
      const body = await c.req.json();
      const validatedBody = body as GitHubInitRequest;
      const client = await getClientForSession(c);
      const response = await client.initGitHubRepository(instanceId, validatedBody);
      return c.json(response);
    } catch (error) {
      return c.json({ 
        success: false, 
        error: `Failed to init GitHub repo: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, 500);
    }
  },

  async pushToGitHubRepo(c: any) {
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
app.post('/instances/:id/save', processController.saveInstance);
app.post('/instances/:id/resume', processController.resumeInstance);

// Deployment routes
app.post('/instances/:id/deploy', deploymentController.deployInstance);
app.get('/instances/:id/deploy', deploymentController.getInstanceDeploymentInfo);

// GitHub integration routes
app.post('/instances/:id/github/init', githubController.initGitHubRepo);
app.post('/instances/:id/github/push', githubController.pushToGitHubRepo);

export default {
  async fetch(request: Request, env: Env) {
    const proxyResponse = await proxyToSandbox(request, env);
    if (proxyResponse) {
      console.log("Proxy response", proxyResponse);
      return proxyResponse;
    }
    console.log("Proxy response not found");
    return app.fetch(request, env);
  },
};