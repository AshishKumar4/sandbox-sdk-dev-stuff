import { getSandbox } from '@cloudflare/sandbox';
import { StructuredLogger } from './logger';
import { env } from 'cloudflare:workers'
import { DeploymentCredentials, DeploymentResult } from './sandboxTypes';

export interface CFDeploymentArgs {
    credentials?: DeploymentCredentials;
    instanceId: string;
    base64encodedArchive: string;
    logger: StructuredLogger;
}

export async function deployToCloudflareWorkers(args: CFDeploymentArgs): Promise<DeploymentResult> {
    const base64Data = args.base64encodedArchive;
    const sandbox = getSandbox(env.DeployerServiceObject, 'deployer');
    await sandbox.writeFile(`${args.instanceId}.zip.b64`, base64Data);
    
    // Convert base64 back to binary zip file
    await sandbox.exec(`base64 -d ${args.instanceId}.zip.b64 > ${args.instanceId}.zip`);
    args.logger.info(`Wrote and converted zip file to sandbox: ${args.instanceId}.zip`);

    // Extract zip file
    await sandbox.exec(`unzip -o -q ${args.instanceId}.zip -d .`);
    args.logger.info(`Extracted zip file to sandbox: ${args.instanceId}`);
    const deployCmd = `CLOUDFLARE_API_TOKEN=${env.CLOUDFLARE_API_TOKEN} CLOUDFLARE_ACCOUNT_ID=${env.CLOUDFLARE_ACCOUNT_ID} bunx wrangler deploy`;
                
    const startTime = Date.now();
    const deployResult = await sandbox.exec(`cd ${args.instanceId} && ${deployCmd}`);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    args.logger.info(`Deployed ${args.instanceId} in ${duration} seconds`, deployResult);
    if (deployResult.exitCode === 0) {
        // Extract deployed URL from output
        const urlMatch = deployResult.stdout.match(/https:\/\/[^\s]+\.workers\.dev/g);
        const deployedUrl = urlMatch ? urlMatch[0] : undefined;
        
        args.logger.info(`Successfully deployed instance ${args.instanceId}`, { deployedUrl });
        
        return {
            success: true,
            message: 'Successfully deployed to Cloudflare Workers',
            deployedUrl,
            deploymentId: `deploy-${args.instanceId}-${Date.now()}`,
            output: deployResult.stdout
        };
    } else {
        throw new Error(`Deployment failed: ${deployResult.stderr}`);
    }
}
