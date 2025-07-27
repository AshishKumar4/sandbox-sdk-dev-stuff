/**
 * Advanced Structured Logging System - Type Definitions
 */

export interface LogContext {
  /** Distributed trace ID */
  traceId?: string;
  /** Current span ID */
  spanId?: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Request ID */
  requestId?: string;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Component name */
  component?: string;
  /** Operation or method name */
  operation?: string;
  /** Object context for the current operation */
  objectContext?: ObjectContext;
  /** Complete ancestry chain (parent -> grandparent -> great-grandparent) */
  ancestry?: ObjectContext[];
  /** Timestamp for this context */
  timestamp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ObjectContext {
  /** Unique identifier for this object instance */
  id?: string;
  /** Type/class name of the object */
  type?: string;
  /** Parent object context if this is a child */
  parent?: ObjectContext;
  /** Complete ancestry chain (parent -> grandparent -> great-grandparent) */
  ancestry?: ObjectContext[];
  /** Additional object-specific metadata */
  meta?: Record<string, unknown>;
}

export interface LogEntry {
  /** Log level */
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Primary log message */
  msg: string;
  /** Timestamp */
  time: string;
  /** Execution context */
  context?: LogContext;
  /** Object context */
  object?: ObjectContext;
  /** Additional structured data */
  data?: Record<string, unknown>;
  /** Error object if applicable */
  err?: Error;
  /** Performance timing data */
  timing?: {
    duration?: number;
    startTime?: number;
    endTime?: number;
  };
}

export interface LoggerConfig {
  /** Base log level */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Pretty print for development */
  prettyPrint?: boolean;
  /** Enable performance timing */
  enableTiming?: boolean;
  /** Enable distributed tracing */
  enableTracing?: boolean;
  /** Custom serializers */
  serializers?: Record<string, (obj: unknown) => unknown>;
  /** Custom formatters */
  formatters?: Record<string, (obj: unknown) => unknown>;
}

export interface TimingContext {
  /** Active operations with their current durations */
  activeOperations: Record<string, number>;
}
