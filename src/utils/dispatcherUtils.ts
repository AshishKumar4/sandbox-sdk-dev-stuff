/**
 * Check if dispatcher is available in the environment
 */
export function isDispatcherAvailable(env: Env): boolean {
    return !!env.DISPATCHER;
}
