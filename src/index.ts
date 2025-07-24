import { getSandbox } from "@cloudflare/sandbox";

// Export the Sandbox class in your Worker
export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env) {
    const sandbox = getSandbox(env.Sandbox, "my-sandbox");

    // Execute a command
    const result = await sandbox.exec("echo 'Hello from the edge!'");
    return new Response(result.stdout);
  },
};