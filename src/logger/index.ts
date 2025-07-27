/**
 * Advanced Structured Logging System - Main Export
 * Production-grade logging with automatic context injection and tracing
 */

export * from './types';
export * from './context';
export * from './core';

import { createLogger, createObjectLogger, LoggerFactory } from './core';
import { ContextUtils, RequestContextManager } from './context';

// Configure logger based on environment
LoggerFactory.configure({
  level: 'debug',
  prettyPrint: true,
  enableTiming: true,
  enableTracing: true
});

/**
 * Logging utilities for common patterns
 */
export const Logger = {
  /**
   * Create a component logger
   */
  create: createLogger,

  /**
   * Create an object logger
   */
  forObject: createObjectLogger,

  /**
   * Configure global logging settings
   */
  configure: LoggerFactory.configure.bind(LoggerFactory),

  /**
   * Get current configuration
   */
  getConfig: LoggerFactory.getConfig.bind(LoggerFactory)
};

/**
 * Context management utilities
 */
export const Context = {
  /**
   * Start a new request context (call this at the beginning of request handling)
   */
  startRequest: ContextUtils.startRequest,

  /**
   * Set component context
   */
  setComponent: ContextUtils.setComponent,

  /**
   * Add metadata to current context
   */
  addMetadata: ContextUtils.addMetadata
};

/**
 * Request-scoped tracing utilities for production-grade distributed tracing
 * Automatically handles trace propagation across all objects touched during request flow
 */
export const Trace = {
  /**
   * Start a new request context (use at API endpoint entry)
   */
  startRequest: RequestContextManager.startRequest,

  /**
   * Execute function within a span with automatic object context (DEPRECATED - use instance methods)
   */
  withSpan: <T>(_operation: string, _obj: any, fn: () => T): T => {
    console.warn('Trace.withSpan is deprecated. Use RequestContextManager instance methods for proper trace propagation.');
    return fn();
  },

  /**
   * Execute async function within a span with automatic object context (DEPRECATED - use instance methods)
   */
  withSpanAsync: async <T>(_operation: string, _obj: any, fn: () => Promise<T>): Promise<T> => {
    console.warn('Trace.withSpanAsync is deprecated. Use RequestContextManager instance methods for proper trace propagation.');
    return await fn();
  },

  /**
   * Get current trace ID from context
   */
  getCurrentId: (): string | null => {
    return ContextUtils.getContext().traceId || null;
  }
};

/**
 * Decorators for automatic logging (TypeScript/ES6)
 */
export function LogMethod(component?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = propertyKey;
    const loggerComponent = component || className;

    descriptor.value = function (...args: any[]) {
      const logger = createObjectLogger(this, loggerComponent);
      
      return logger.measureAsync(`${methodName}`, async () => {
        logger.debug(`Entering method: ${methodName}`, { args: args.length });
        try {
          const result = await originalMethod.apply(this, args);
          logger.debug(`Exiting method: ${methodName}`, { success: true });
          return result;
        } catch (error) {
          logger.error(`Method ${methodName} failed`, error);
          throw error;
        }
      });
    };

    return descriptor;
  };
}

/**
 * Class decorator for automatic logger injection
 */
export function WithLogger(component?: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      protected logger = createObjectLogger(this, component || constructor.name);
    };
  };
}

// Export default logger instance for quick usage
export default Logger;
