/**
 * Context Management for Structured Logging
 * Handles automatic context injection and tracing
 */

import { type LogContext, type ObjectContext } from './types';

/**
 * Request-scoped context store for proper request isolation in Cloudflare Workers
 * Each request gets its own isolated context to prevent contamination
 */
class ContextStore {
  private contextStack: LogContext[] = [];
  private currentContext: LogContext = {};
  private readonly requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.currentContext = {
      requestId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get the request ID for this context store
   */
  getRequestId(): string {
    return this.requestId;
  }

  /**
   * Get request-scoped context store (no more singleton!)
   */
  static getRequestStore(requestId: string): ContextStore {
    return new ContextStore(requestId);
  }

  /**
   * Set the current log context
   */
  setContext(context: Partial<LogContext>): void {
    this.currentContext = { ...this.currentContext, ...context };
  }

  /**
   * Get the current log context
   */
  getContext(): LogContext {
    return { ...this.currentContext };
  }

  /**
   * Push a new context layer (for nested operations)
   */
  pushContext(context: Partial<LogContext>): void {
    this.contextStack.push({ ...this.currentContext });
    this.setContext(context);
  }

  /**
   * Pop the most recent context layer
   */
  popContext(): void {
    const previous = this.contextStack.pop();
    if (previous) {
      this.currentContext = previous;
    }
  }

  /**
   * Execute a function with a specific context
   */
  withContext<T>(context: Partial<LogContext>, fn: () => T): T {
    this.pushContext(context);
    try {
      return fn();
    } finally {
      this.popContext();
    }
  }

  /**
   * Execute an async function with a specific context
   */
  async withContextAsync<T>(context: Partial<LogContext>, fn: () => Promise<T>): Promise<T> {
    this.pushContext(context);
    try {
      return await fn();
    } finally {
      this.popContext();
    }
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.currentContext = {};
    this.contextStack = [];
  }
}

// Request-scoped context store implementation
// This will be replaced with proper request-scoped stores
let currentContextStore: ContextStore | null = null;

export const contextStore = {
  setContext: (context: Partial<LogContext>) => {
    if (currentContextStore) {
      currentContextStore.setContext(context);
    }
  },
  getContext: (): LogContext => {
    return currentContextStore ? currentContextStore.getContext() : {};
  },
  pushContext: (context: Partial<LogContext>) => {
    if (currentContextStore) {
      currentContextStore.pushContext(context);
    }
  },
  popContext: () => {
    if (currentContextStore) {
      currentContextStore.popContext();
    }
  },
  initializeForRequest: (requestId: string) => {
    currentContextStore = ContextStore.getRequestStore(requestId);
  }
};

/**
 * Request-Scoped Context Manager for Production-Grade Distributed Tracing
 * Handles automatic trace propagation across all objects touched during request flow
 */
export class RequestContextManager {
  private traceId: string;
  private spanCounter = 0;
  private objectRegistry = new Map<string, ObjectContext>();
  
  constructor(requestId?: string) {
    this.traceId = requestId || `trace-${Date.now()}-${this.generateId()}`;
  }

  /**
   * Start a new request context - called at API endpoint entry
   * Initialize request-scoped context store for distributed tracing
   */
  static startRequest(requestId?: string, metadata?: Record<string, any>): RequestContextManager {
    const manager = new RequestContextManager(requestId);
    const rootSpanId = manager.generateSpanId();
    
    // Initialize request-scoped context store
    const actualRequestId = requestId || manager.traceId;
    contextStore.initializeForRequest(actualRequestId);
    
    const context: LogContext = {
      traceId: manager.traceId,
      spanId: rootSpanId,
      parentSpanId: undefined,
      requestId: actualRequestId,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
      operation: 'request_start'
    };
    
    contextStore.setContext(context);
    return manager;
  }

  /**
   * Register an object in the current request context with full ancestry tracking
   */
  registerObject(obj: any, parent?: ObjectContext): ObjectContext {
    const objectContext = ObjectContextBuilder.fromObject(obj, parent);
    
    // Generate unique object ID if not present
    if (!objectContext.id) {
      const type = objectContext.type || 'unknown';
      objectContext.id = `${type.toLowerCase()}-${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
    }
    
    // Store in registry for ancestry tracking
    this.objectRegistry.set(objectContext.id, objectContext);
    
    return objectContext;
  }

  /**
   * Start a new span within the current trace
   */
  startSpan(operation: string, objectContext?: ObjectContext): string {
    const spanId = this.generateSpanId();
    const currentContext = contextStore.getContext();
    
    const spanContext: Partial<LogContext> = {
      spanId,
      parentSpanId: currentContext.spanId,
      operation,
      objectContext
    };
    
    contextStore.pushContext(spanContext);
    return spanId;
  }

  /**
   * End the current span
   */
  endSpan(): void {
    contextStore.popContext();
  }

  /**
   * Execute a function within a span with automatic object context
   */
  withSpan<T>(operation: string, obj: any, fn: () => T): T {
    const objectContext = this.registerObject(obj);
    this.startSpan(operation, objectContext);
    try {
      return fn();
    } finally {
      this.endSpan();
    }
  }

  /**
   * Execute an async function within a span with automatic object context
   */
  async withSpanAsync<T>(operation: string, obj: any, fn: () => Promise<T>): Promise<T> {
    const objectContext = this.registerObject(obj);
    this.startSpan(operation, objectContext);
    try {
      return await fn();
    } finally {
      this.endSpan();
    }
  }

  /**
   * Get current trace ID
   */
  getCurrentTraceId(): string {
    return this.traceId;
  }

  // /**
  //    * Build complete ancestry chain for an object (parent -> grandparent -> great-grandparent)
  //  */
  // private buildAncestryChain(objectContext: ObjectContext): ObjectContext[] {
  //   const chain: ObjectContext[] = [objectContext];
  //   let current = objectContext.parent;
    
  //   while (current) {
  //     chain.unshift(current);
  //     current = current.parent;
  //   }
    
  //   return chain;
  // }

  private generateSpanId(): string {
    this.spanCounter++;
    return `span-${this.traceId}-${this.spanCounter.toString(36).padStart(7, '0')}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

/**
 * Object context builder for automatic metadata injection
 */
export class ObjectContextBuilder {
  /**
   * Create object context from an object instance - SAFE for Cloudflare Workers
   */
  static fromObject(obj: any, parent?: ObjectContext): ObjectContext {
    const context: ObjectContext = {
      type: obj?.constructor?.name || typeof obj
    };

    // Try to extract ID from common properties - SAFE access
    try {
      if (obj.id) context.id = String(obj.id);
      else if (obj._id) context.id = String(obj._id);
      else if (obj.uuid) context.id = String(obj.uuid);
      else if (obj.guid) context.id = String(obj.guid);
    } catch (e) {
      // If ID extraction fails, generate a safe ID
      context.id = `${context.type?.toLowerCase() || 'object'}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    // Add parent reference
    if (parent) {
      context.parent = parent;
    }

    // Extract additional metadata - SAFE access with try/catch
    const meta: Record<string, any> = {};
    
    try {
      // Safe property access with error handling
      // if (obj.hasOwnProperty('name') && obj.name !== undefined) {
      //   meta.name = obj.name;
      // }
      if (obj.hasOwnProperty('version') && obj.version !== undefined) {
        meta.version = obj.version;
      }
      if (obj.hasOwnProperty('status') && obj.status !== undefined) {
        meta.status = obj.status;
      }
      if (obj.hasOwnProperty('state') && obj.state !== undefined) {
        meta.state = obj.state;
      }
      
      // Add object type information
      meta.objectType = context.type;
      meta.created = new Date().toISOString();
      
    } catch (e) {
      // If metadata extraction fails, just use basic info
      meta.objectType = context.type;
      meta.created = new Date().toISOString();
      meta.error = 'metadata_extraction_failed';
    }
    
    if (Object.keys(meta).length > 0) {
      context.meta = meta;
    }

    return context;
  }

  /**
   * Create object context manually
   */
  static create(id: string, type: string, meta?: Record<string, any>, parent?: ObjectContext): ObjectContext {
    return {
      id,
      type,
      meta,
      parent
    };
  }
}

/**
 * Utility functions for context management
 */
export const ContextUtils = {
  /**
   * Start a new request context with automatic trace propagation
   */
  startRequest(requestId?: string, userId?: string, sessionId?: string): RequestContextManager {
    const manager = RequestContextManager.startRequest(requestId, {
      userId,
      sessionId,
      requestStart: new Date().toISOString()
    });
    
    return manager;
  },

  /**
   * Set component context
   */
  setComponent(component: string, operation?: string): void {
    contextStore.setContext({ component, operation });
  },

  /**
   * Add metadata to current context
   */
  addMetadata(metadata: Record<string, any>): void {
    const current = contextStore.getContext();
    contextStore.setContext({
      metadata: { ...current.metadata, ...metadata }
    });
  },

  /**
   * Get current context
   */
  getContext(): LogContext {
    return contextStore.getContext();
  }
};
