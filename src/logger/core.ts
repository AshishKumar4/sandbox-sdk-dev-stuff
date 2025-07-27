/**
 * Production-Grade Structured Logging System
 * Clean, modular, high-performance logger for Cloudflare Workers
 * 
 * Features:
 * - Automatic object context injection with full inheritance chains
 * - Distributed tracing with correlation IDs
 * - Performance monitoring with built-in timing
 * - Hierarchical parent-child-grandparent relationships
 * - Zero external dependencies
 * - Universal compatibility (Workers, Node.js, browsers)
 */

import type { LoggerConfig, ObjectContext } from './types';
import { contextStore, ObjectContextBuilder } from './context';

/**
 * Default configuration optimized for production
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  prettyPrint: false,
  enableTiming: false, // Disabled by default as requested
  enableTracing: true,
  serializers: {},
  formatters: {}
};

/**
 * High-performance timing system for operation measurement
 */
class TimingManager {
  private activeTimers = new Map<string, number>();
  private completedOperations = new Map<string, number>();

  /**
   * Start timing an operation
   */
  startTiming(operation: string): void {
    this.activeTimers.set(operation, Date.now());
  }

  /**
   * End timing and return duration
   */
  endTiming(operation: string): number | null {
    const startTime = this.activeTimers.get(operation);
    if (!startTime) return null;

    const duration = Date.now() - startTime;
    this.activeTimers.delete(operation);
    this.completedOperations.set(operation, duration);
    return duration;
  }

  /**
   * Get all active timing operations
   */
  getActiveTiming(): Record<string, number> {
    const result: Record<string, number> = {};
    const now = Date.now();
    
    for (const [operation, startTime] of this.activeTimers.entries()) {
      result[operation] = now - startTime;
    }
    
    return result;
  }

  /**
   * Get timing context for logs
   */
  getTimingContext() {
    const activeOperations = this.getActiveTiming();
    return Object.keys(activeOperations).length > 0 ? { activeOperations } : null;
  }
}

/**
 * Context enrichment system for automatic metadata injection
 */
class ContextEnricher {
  /**
   * Build complete log context with all available metadata
   */
  static enrichLogEntry(
    level: string,
    message: string,
    component: string,
    objectContext?: ObjectContext,
    data?: Record<string, any>,
    error?: Error,
    timingContext?: any
  ): Record<string, any> {
    const timestamp = new Date().toISOString();
    const traceContext = contextStore.getContext();

    // Base log entry
    const logEntry: Record<string, any> = {
      level,
      time: timestamp,
      component,
      msg: message
    };

    // Add object context with full inheritance chain
    if (objectContext) {
      logEntry.object = this.buildObjectChain(objectContext);
    }

    // Add distributed tracing context
    if (traceContext && (traceContext.traceId || traceContext.requestId)) {
      logEntry.context = {
        ...(traceContext.traceId && { traceId: traceContext.traceId }),
        ...(traceContext.spanId && { spanId: traceContext.spanId }),
        ...(traceContext.parentSpanId && { parentSpanId: traceContext.parentSpanId }),
        ...(traceContext.requestId && { requestId: traceContext.requestId }),
        ...(traceContext.sessionId && { sessionId: traceContext.sessionId }),
        ...(traceContext.userId && { userId: traceContext.userId })
      };
    }

    // Add timing information
    if (timingContext) {
      logEntry.timing = timingContext;
    }

    // Add structured data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.assign(logEntry, data);
    }

    // Add error details with full stack trace
    if (error && error instanceof Error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
      
      // Add cause if available (safe spread)
      if (error.cause) {
        logEntry.error.cause = error.cause;
      }
    }

    return logEntry;
  }

  /**
   * Build complete parent-child-grandparent object relationship chain
   */
  private static buildObjectChain(objectContext: ObjectContext | undefined): any {
    if (!objectContext) {
      return { type: 'Unknown', id: 'unknown' };
    }
    const chain: any = {
      type: objectContext.type,
      id: objectContext.id
    };

    // Add metadata if available
    if (objectContext.meta && Object.keys(objectContext.meta).length > 0) {
      chain.meta = objectContext.meta;
    }

    // Build complete parent chain (parent -> grandparent -> great-grandparent...)
    if (objectContext.parent) {
      const parents: any[] = [];
      let currentParent: ObjectContext | undefined = objectContext.parent;
      
      while (currentParent) {
        parents.push({
          type: currentParent.type,
          id: currentParent.id,
          ...(currentParent.meta && { meta: currentParent.meta })
        });
        currentParent = currentParent.parent; // TypeScript now knows this can be undefined
      }
      
      if (parents.length > 0) {
        chain.parents = parents;
        chain.parentChain = parents.map(p => `${p.type}#${p.id}`).join(' -> ');
      }
    }

    return chain;
  }
}

/**
 * Output manager for different environments and formats
 */
class OutputManager {
  /**
   * Output log entry using appropriate method for environment
   */
  static output(level: string, logEntry: Record<string, any>, config: LoggerConfig): void {
      this.prettyOutput(level, logEntry);
  }

  /**
   * Pretty formatted output for development
   */
  private static prettyOutput(level: string, logEntry: Record<string, any>): void {
    const timestamp = logEntry.time;
    const component = logEntry.component;
    const objectInfo = logEntry.object ? 
      `[${logEntry.object.type}#${logEntry.object.id}${logEntry.object.parentChain ? ` <- ${logEntry.object.parentChain}` : ''}]` : '';
    const traceInfo = logEntry.context?.traceId ? 
      `trace:${logEntry.context.traceId.slice(-8)}` : '';
    
    const prefix = `${timestamp} ${level.toUpperCase()} ${component}${objectInfo} ${traceInfo}`.trim();
    const message = logEntry.msg;
    
    // Choose appropriate console method
    const consoleMethod = level === 'error' ? 'error' : 
                         level === 'warn' ? 'warn' : 
                         level === 'debug' ? 'debug' : 'log';
    
    // Extract additional structured data
    const { level: _, time, component: __, msg, object, context, error, timing, ...additionalData } = logEntry;
    
    const hasAdditionalData = Object.keys(additionalData).length > 0;
    const hasError = !!error;
    const hasTiming = !!timing;
    
    if (hasAdditionalData || hasError || hasTiming) {
      const extraInfo: any = {};
      if (hasAdditionalData) Object.assign(extraInfo, additionalData);
      if (hasTiming) extraInfo.timing = timing;
      if (hasError) extraInfo.error = error;
      
      console[consoleMethod](`${prefix}: ${message}`, extraInfo);
    } else {
      console[consoleMethod](`${prefix}: ${message}`);
    }
  }

  /**
   * Structured JSON output for production
   */
  private static jsonOutput(level: string, logEntry: Record<string, any>): void {
    const consoleMethod = level === 'error' ? 'error' : 
                         level === 'warn' ? 'warn' : 
                         level === 'debug' ? 'debug' : 'log';
    
    console[consoleMethod](JSON.stringify(logEntry));
  }
}

/**
 * Main StructuredLogger class - Production-grade logging with all requested features
 */
export class StructuredLogger {
  private readonly component: string;
  private objectContext?: ObjectContext; // Made mutable for dynamic field setting
  private readonly config: LoggerConfig;
  private readonly timingManager: TimingManager;

  constructor(component: string, objectContext?: ObjectContext, config?: LoggerConfig) {
    this.component = component;
    this.objectContext = objectContext;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timingManager = new TimingManager();
    
    // Automatically start tracing if not already active
    this.ensureTraceContext();
  }

  /**
   * Ensure trace context exists - automatic tracing setup
   * Generate unique spans per component while preserving request-level trace context
   */
  private ensureTraceContext(): void {
    const currentContext = contextStore.getContext();
    
    if (this.config.enableTracing) {
      if (!currentContext.traceId) {
        // New request: generate fresh trace context
        const traceId = this.generateTraceId();
        const spanId = this.generateSpanId();
        
        contextStore.setContext({
          traceId,
          spanId,
          component: this.component,
          operation: 'request_start',
          metadata: { 
            timestamp: new Date().toISOString(),
            requestStart: true
          }
        });
      } else {
        // Existing request: create new span within current trace
        const newSpanId = this.generateSpanId();
        
        contextStore.setContext({
          ...currentContext,
          spanId: newSpanId,
          parentSpanId: currentContext.spanId,
          component: this.component,
          operation: `${this.component}_operation`,
          metadata: {
            ...currentContext.metadata,
            timestamp: new Date().toISOString(),
            componentStart: true
          }
        });
      }
    }
  }

  /**
   * Generate unique trace ID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique span ID with microsecond precision and component info
   */
  private generateSpanId(): string {
    const timestamp = Date.now();
    const microseconds = performance.now().toString().replace('.', '');
    const randomId = Math.random().toString(36).substring(2, 9);
    const componentId = this.component.toLowerCase().substring(0, 3);
    return `span-${timestamp}-${microseconds}-${componentId}-${randomId}`;
  }

  /**
   * Core logging method with complete context enrichment
   */
  private log(level: string, message: string, data?: Record<string, any>, error?: Error): void {
    // Check log level filtering
    if (!this.shouldLog(level)) return;

    // Get timing context if enabled
    const timingContext = this.config.enableTiming ? 
      this.timingManager.getTimingContext() : null;

    // Build enriched log entry with all context
    const logEntry = ContextEnricher.enrichLogEntry(
      level,
      message,
      this.component,
      this.objectContext,
      data,
      error,
      timingContext
    );

    // Output using appropriate formatter
    OutputManager.output(level, logEntry, this.config);
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: string): boolean {
    const levels = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
    const configLevel = levels[this.config.level as keyof typeof levels] ?? 2;
    const messageLevel = levels[level as keyof typeof levels] ?? 2;
    return messageLevel >= configLevel;
  }

  // ========================================================================
  // PUBLIC LOGGING METHODS
  // ========================================================================

  // ========================================================================
  // DYNAMIC FIELD MANAGEMENT
  // ========================================================================

  /**
   * Set additional fields that will be included in all log entries
   */
  setFields(fields: Record<string, any>): void {
    if (!this.objectContext) {
      this.objectContext = { type: 'DynamicLogger', id: 'dynamic-' + Date.now() };
    }
    this.objectContext.meta = { ...this.objectContext.meta, ...fields };
  }

  /**
   * Set a single field
   */
  setField(key: string, value: any): void {
    this.setFields({ [key]: value });
  }

  /**
   * Clear all dynamic fields
   */
  clearFields(): void {
    if (this.objectContext?.meta) {
      this.objectContext.meta = {};
    }
  }

  /**
   * Set the object context (used internally for safe initialization)
   */
  setObjectContext(context: ObjectContext): void {
    this.objectContext = context;
  }

  // ========================================================================
  // FLEXIBLE LOGGING METHODS - Accept any argument types naturally
  // ========================================================================

  /**
   * Trace level logging - accepts any arguments
   */
  trace(message: string, ...args: any[]): void {
    this.log('trace', message, this.processArgs(args));
  }

  /**
   * Debug level logging - accepts any arguments
   */
  debug(message: string, ...args: any[]): void {
    this.log('debug', message, this.processArgs(args));
  }

  /**
   * Info level logging - accepts any arguments
   */
  info(message: string, ...args: any[]): void {
    this.log('info', message, this.processArgs(args));
  }

  /**
   * Warning level logging - accepts any arguments
   */
  warn(message: string, ...args: any[]): void {
    this.log('warn', message, this.processArgs(args));
  }

  /**
   * Error level logging - accepts any arguments naturally
   */
  error(message: string, ...args: any[]): void {
    const { data, error } = this.processArgsWithError(args);
    this.log('error', message, data, error);
  }

  /**
   * Fatal level logging - accepts any arguments
   */
  fatal(message: string, ...args: any[]): void {
    const { data, error } = this.processArgsWithError(args);
    this.log('fatal', message, data, error);
  }

  /**
   * Process arguments intelligently for flexible API
   */
  private processArgs(args: any[]): Record<string, any> {
    if (args.length === 0) return {};
    if (args.length === 1) {
      const arg = args[0];
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !(arg instanceof Error)) {
        return arg;
      }
      return { data: arg };
    }
    
    // Multiple arguments - convert to structured data
    const result: Record<string, any> = {};
    args.forEach((arg, index) => {
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !(arg instanceof Error)) {
        Object.assign(result, arg);
      } else {
        result[`arg${index}`] = arg;
      }
    });
    return result;
  }

  /**
   * Process arguments with special error handling
   */
  private processArgsWithError(args: any[]): { data: Record<string, any>; error?: Error } {
    let error: Error | undefined;
    const otherArgs: any[] = [];
    
    // Separate Error objects from other arguments
    args.forEach(arg => {
      if (arg instanceof Error) {
        error = arg;
      } else {
        otherArgs.push(arg);
      }
    });
    
    return {
      data: this.processArgs(otherArgs),
      error
    };
  }

  // ========================================================================
  // OPTIONAL PERFORMANCE TIMING METHODS (disabled by default)
  // ========================================================================

  /**
   * Start timing an operation (only if timing enabled)
   */
  time(operation: string, metadata?: Record<string, any>): void {
    if (this.config.enableTiming) {
      this.timingManager.startTiming(operation);
      if (metadata) {
        this.debug(`Starting operation: ${operation}`, metadata);
      }
    }
  }

  /**
   * End timing an operation and log the duration (only if timing enabled)
   */
  timeEnd(operation: string, data?: Record<string, any>): void {
    if (this.config.enableTiming) {
      const duration = this.timingManager.endTiming(operation);
      if (duration !== null) {
        this.info(`Operation completed: ${operation}`, {
          duration: `${duration}ms`,
          durationMs: duration,
          ...data
        });
      }
    }
  }

  /**
   * Measure synchronous function execution time (only if timing enabled)
   */
  measure<T>(operation: string, fn: () => T, metadata?: Record<string, any>): T {
    if (this.config.enableTiming) {
      this.time(operation, metadata);
      try {
        const result = fn();
        this.timeEnd(operation, { success: true });
        return result;
      } catch (error) {
        this.timeEnd(operation, { success: false });
        throw error;
      }
    } else {
      return fn();
    }
  }

  /**
   * Measure asynchronous function execution time (only if timing enabled)
   */
  async measureAsync<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    if (this.config.enableTiming) {
      this.time(operation, metadata);
      try {
        const result = await fn();
        this.timeEnd(operation, { success: true });
        return result;
      } catch (error) {
        this.timeEnd(operation, { success: false });
        throw error;
      }
    } else {
      return await fn();
    }
  }

  // ========================================================================
  // HIERARCHICAL LOGGER CREATION
  // ========================================================================

  /**
   * Create child logger with extended context
   */
  child(childContext: Partial<ObjectContext>, component?: string): StructuredLogger {
    const newComponent = component || this.component;
    
    // Merge contexts while preserving parent chain
    const mergedContext: ObjectContext = {
      type: childContext.type || 'ChildLogger',
      id: childContext.id || 'child-' + Date.now(),
      ...childContext,
      parent: this.objectContext // Maintain parent chain
    };
    
    return new StructuredLogger(newComponent, mergedContext, this.config);
  }

  /**
   * Create logger for specific object with automatic context extraction
   */
  forObject(obj: any, component?: string): StructuredLogger {
    const objectContext = ObjectContextBuilder.fromObject(obj, this.objectContext);
    return new StructuredLogger(
      component || this.component,
      objectContext,
      this.config
    );
  }

  /**
   * Get underlying logger instance (compatibility method)
   */
  getPinoLogger(): StructuredLogger {
    return this;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a basic structured logger
 */
export function createLogger(component: string, config?: LoggerConfig): StructuredLogger {
  return new StructuredLogger(component, undefined, config);
}

/**
 * Create logger with safe object context injection for Cloudflare Workers
 * Handles uninitialized objects gracefully
 */
export function createObjectLogger(
  obj: any, 
  component?: string, 
  config?: LoggerConfig
): StructuredLogger {
  // Create logger first, then set object context safely
  const componentName = component || safeGetConstructorName(obj) || 'UnknownComponent';
  const logger = new StructuredLogger(componentName, undefined, config);
  
  // Set object context safely after creation with ancestry tracking
  try {
    // Detect parent context from current trace for ancestry tracking
    const currentContext = contextStore.getContext();
    let parentContext: ObjectContext | undefined;
    
    // If there's an existing object context in the trace, use it as parent
    if (currentContext.objectContext) {
      parentContext = currentContext.objectContext;
    }
    
    // Build object context with parent relationship
    const objectContext = ObjectContextBuilder.fromObject(obj, parentContext);
    
    // Build ancestry chain for parent-child relationships
    if (parentContext) {
      objectContext.ancestry = buildAncestryChain(objectContext);
    }
    
    logger.setObjectContext(objectContext);
    
    // Update trace context to include this object for future child loggers
    contextStore.setContext({
      ...currentContext,
      objectContext: objectContext,
      metadata: {
        ...currentContext.metadata,
        lastObjectType: objectContext.type,
        lastObjectId: objectContext.id
      }
    });
    
  } catch (error) {
    // If object isn't fully initialized, set basic context
    const basicContext = {
      type: componentName,
      id: `${componentName.toLowerCase()}-${Date.now()}`,
      meta: { 
        initialized: false,
        error: 'object_context_creation_failed'
      }
    };
    logger.setObjectContext(basicContext);
  }
  
  return logger;
}

/**
 * Build complete ancestry chain for an object (parent -> grandparent -> great-grandparent)
 */
function buildAncestryChain(objectContext: ObjectContext): ObjectContext[] {
  const chain: ObjectContext[] = [objectContext];
  let current = objectContext.parent;
  
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }
  
  return chain;
}

/**
 * Safely get constructor name without triggering Cloudflare Workers errors
 */
function safeGetConstructorName(obj: any): string | undefined {
  try {
    return obj?.constructor?.name;
  } catch {
    return undefined;
  }
}

/**
 * Logger factory for creating loggers with consistent configuration
 */
export class LoggerFactory {
  private static globalConfig: LoggerConfig = {
    level: 'info',
    prettyPrint: true,
    enableTiming: true,
    enableTracing: true
  };

  /**
   * Set global logger configuration
   */
  static configure(config: Partial<LoggerConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };
  }

  /**
   * Get current global configuration
   */
  static getConfig(): LoggerConfig {
    return { ...this.globalConfig };
  }
}
