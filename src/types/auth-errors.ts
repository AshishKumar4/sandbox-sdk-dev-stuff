/**
 * Comprehensive Authentication Error Definitions
 * Provides structured error handling for all authentication scenarios
 */

/**
 * Base authentication error class with enhanced context
 */
export abstract class BaseAuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string,
    statusCode: number,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BaseAuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date();
    this.context = context;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Convert error to API response format
   */
  toResponse(): AuthErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp.toISOString(),
        context: this.context
      }
    };
  }
  
  /**
   * Convert error to log format
   */
  toLogEntry(): AuthErrorLogEntry {
    return {
      level: this.statusCode >= 500 ? 'error' : 'warn',
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      stack: this.stack,
      context: this.context
    };
  }
}

/**
 * Authentication validation errors (400)
 */
export class AuthValidationError extends BaseAuthError {
  public readonly field?: string;
  public readonly validationErrors?: string[];
  
  constructor(
    message: string,
    field?: string,
    validationErrors?: string[],
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_VALIDATION_ERROR', 400, {
      ...context,
      field,
      validationErrors
    });
    this.name = 'AuthValidationError';
    this.field = field;
    this.validationErrors = validationErrors;
  }
  
  static invalidEmail(email?: string): AuthValidationError {
    return new AuthValidationError(
      'Invalid email format',
      'email',
      ['Email must be a valid email address'],
      { providedEmail: email?.substring(0, 50) }
    );
  }
  
  static weakPassword(errors: string[]): AuthValidationError {
    return new AuthValidationError(
      'Password does not meet security requirements',
      'password',
      errors
    );
  }
  
  static missingField(field: string): AuthValidationError {
    return new AuthValidationError(
      `${field} is required`,
      field,
      [`${field} cannot be empty`]
    );
  }
}

/**
 * Authentication credential errors (401)
 */
export class AuthCredentialError extends BaseAuthError {
  public readonly attemptType: string;
  
  constructor(
    message: string,
    attemptType: string = 'unknown',
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_CREDENTIAL_ERROR', 401, {
      ...context,
      attemptType
    });
    this.name = 'AuthCredentialError';
    this.attemptType = attemptType;
  }
  
  static invalidCredentials(attemptType: string = 'login'): AuthCredentialError {
    return new AuthCredentialError(
      'Invalid email or password',
      attemptType
    );
  }
  
  static accountNotFound(): AuthCredentialError {
    return new AuthCredentialError(
      'Account not found',
      'lookup'
    );
  }
  
  static accountSuspended(): AuthCredentialError {
    return new AuthCredentialError(
      'Account has been suspended',
      'access',
      { reason: 'Account suspension' }
    );
  }
  
  static emailNotVerified(): AuthCredentialError {
    return new AuthCredentialError(
      'Email address not verified',
      'verification',
      { requiresAction: 'email_verification' }
    );
  }
}

/**
 * Token-related errors (401)
 */
export class AuthTokenError extends BaseAuthError {
  public readonly tokenType: string;
  public readonly tokenHint?: string;
  
  constructor(
    message: string,
    tokenType: string = 'unknown',
    tokenHint?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_TOKEN_ERROR', 401, {
      ...context,
      tokenType,
      tokenHint
    });
    this.name = 'AuthTokenError';
    this.tokenType = tokenType;
    this.tokenHint = tokenHint;
  }
  
  static invalidToken(tokenType: string = 'access'): AuthTokenError {
    return new AuthTokenError(
      'Invalid or malformed token',
      tokenType
    );
  }
  
  static expiredToken(tokenType: string = 'access', expiresAt?: Date): AuthTokenError {
    return new AuthTokenError(
      'Token has expired',
      tokenType,
      undefined,
      { expiresAt: expiresAt?.toISOString() }
    );
  }
  
  static revokedToken(tokenType: string = 'access'): AuthTokenError {
    return new AuthTokenError(
      'Token has been revoked',
      tokenType
    );
  }
  
  static missingToken(): AuthTokenError {
    return new AuthTokenError(
      'Authentication token required',
      'missing'
    );
  }
}

/**
 * OAuth-specific errors (400/401)
 */
export class AuthOAuthError extends BaseAuthError {
  public readonly provider: string;
  public readonly oauthError?: string;
  public readonly oauthErrorDescription?: string;
  
  constructor(
    message: string,
    provider: string,
    statusCode: number = 400,
    oauthError?: string,
    oauthErrorDescription?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_OAUTH_ERROR', statusCode, {
      ...context,
      provider,
      oauthError,
      oauthErrorDescription
    });
    this.name = 'AuthOAuthError';
    this.provider = provider;
    this.oauthError = oauthError;
    this.oauthErrorDescription = oauthErrorDescription;
  }
  
  static invalidState(provider: string): AuthOAuthError {
    return new AuthOAuthError(
      'Invalid OAuth state parameter',
      provider,
      400,
      'invalid_request',
      'State parameter is invalid or expired'
    );
  }
  
  static exchangeFailed(provider: string, oauthError?: string): AuthOAuthError {
    return new AuthOAuthError(
      'Failed to exchange authorization code for tokens',
      provider,
      400,
      oauthError,
      'Token exchange failed'
    );
  }
  
  static userInfoFailed(provider: string): AuthOAuthError {
    return new AuthOAuthError(
      'Failed to retrieve user information',
      provider,
      500,
      'server_error',
      'Cannot fetch user profile'
    );
  }
  
  static providerNotConfigured(provider: string): AuthOAuthError {
    return new AuthOAuthError(
      `OAuth provider ${provider} is not configured`,
      provider,
      500,
      'server_error',
      'Provider configuration missing'
    );
  }
}

/**
 * Rate limiting errors (429)
 */
export class AuthRateLimitError extends BaseAuthError {
  public readonly retryAfter: number;
  public readonly limit: number;
  public readonly remaining: number;
  public readonly resetTime: Date;
  
  constructor(
    message: string,
    retryAfter: number,
    limit: number,
    remaining: number,
    resetTime: Date,
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_RATE_LIMIT_ERROR', 429, {
      ...context,
      retryAfter,
      limit,
      remaining,
      resetTime: resetTime.toISOString()
    });
    this.name = 'AuthRateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
  
  static tooManyAttempts(
    attemptType: string,
    retryAfter: number,
    limit: number
  ): AuthRateLimitError {
    const resetTime = new Date(Date.now() + retryAfter * 1000);
    return new AuthRateLimitError(
      `Too many ${attemptType} attempts. Please try again later.`,
      retryAfter,
      limit,
      0,
      resetTime,
      { attemptType }
    );
  }
  
  /**
   * Get rate limit headers for HTTP response
   */
  getRateLimitHeaders(): Record<string, string> {
    return {
      'X-RateLimit-Limit': this.limit.toString(),
      'X-RateLimit-Remaining': this.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(this.resetTime.getTime() / 1000).toString(),
      'Retry-After': this.retryAfter.toString()
    };
  }
}

/**
 * Permission/authorization errors (403)
 */
export class AuthPermissionError extends BaseAuthError {
  public readonly requiredPermission?: string;
  public readonly userPermissions?: string[];
  
  constructor(
    message: string,
    requiredPermission?: string,
    userPermissions?: string[],
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_PERMISSION_ERROR', 403, {
      ...context,
      requiredPermission,
      userPermissions
    });
    this.name = 'AuthPermissionError';
    this.requiredPermission = requiredPermission;
    this.userPermissions = userPermissions;
  }
  
  static insufficientPermissions(
    required: string,
    userPermissions: string[] = []
  ): AuthPermissionError {
    return new AuthPermissionError(
      'Insufficient permissions to perform this action',
      required,
      userPermissions
    );
  }
  
  static accountLocked(): AuthPermissionError {
    return new AuthPermissionError(
      'Account is temporarily locked due to security concerns'
    );
  }
  
  static anonymousNotAllowed(): AuthPermissionError {
    return new AuthPermissionError(
      'This action requires authentication'
    );
  }
}

/**
 * Session-related errors (401/409)
 */
export class AuthSessionError extends BaseAuthError {
  public readonly sessionId?: string;
  
  constructor(
    message: string,
    statusCode: number,
    sessionId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_SESSION_ERROR', statusCode, {
      ...context,
      sessionId
    });
    this.name = 'AuthSessionError';
    this.sessionId = sessionId;
  }
  
  static sessionNotFound(sessionId?: string): AuthSessionError {
    return new AuthSessionError(
      'Session not found or expired',
      401,
      sessionId
    );
  }
  
  static sessionExpired(sessionId?: string): AuthSessionError {
    return new AuthSessionError(
      'Session has expired',
      401,
      sessionId
    );
  }
  
  static sessionHijacked(sessionId?: string): AuthSessionError {
    return new AuthSessionError(
      'Session security violation detected',
      401,
      sessionId,
      { reason: 'potential_hijacking' }
    );
  }
  
  static concurrentSessionLimit(): AuthSessionError {
    return new AuthSessionError(
      'Maximum number of concurrent sessions reached',
      409
    );
  }
}

/**
 * Server-side authentication errors (500)
 */
export class AuthServerError extends BaseAuthError {
  public readonly operation: string;
  
  constructor(
    message: string,
    operation: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'AUTH_SERVER_ERROR', 500, {
      ...context,
      operation
    });
    this.name = 'AuthServerError';
    this.operation = operation;
  }
  
  static databaseError(operation: string, dbError?: Error): AuthServerError {
    return new AuthServerError(
      'Database operation failed',
      operation,
      { 
        dbError: dbError?.message,
        dbStack: dbError?.stack?.substring(0, 500)
      }
    );
  }
  
  static cryptoError(operation: string): AuthServerError {
    return new AuthServerError(
      'Cryptographic operation failed',
      operation
    );
  }
  
  static configurationError(operation: string, missing: string[]): AuthServerError {
    return new AuthServerError(
      'Authentication service configuration error',
      operation,
      { missingConfiguration: missing }
    );
  }
}

/**
 * API response format for authentication errors
 */
export interface AuthErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
  };
}

/**
 * Log entry format for authentication errors
 */
export interface AuthErrorLogEntry {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  statusCode: number;
  timestamp: Date;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Error context for authentication operations
 */
export interface AuthErrorContext {
  // Request context
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // User context
  userId?: string;
  email?: string;
  sessionId?: string;
  
  // Operation context
  operation: string;
  attemptType?: string;
  
  // Additional metadata
  metadata?: Record<string, unknown>;
}

/**
 * Utility functions for error handling
 */
export class AuthErrorUtils {
  /**
   * Determine if error should be logged as critical
   */
  static isCritical(error: BaseAuthError): boolean {
    return error.statusCode >= 500 || 
           error.code === 'AUTH_SESSION_ERROR' ||
           error.code === 'AUTH_SERVER_ERROR';
  }
  
  /**
   * Extract safe error details for client response
   */
  static getSafeErrorDetails(error: BaseAuthError): Partial<AuthErrorResponse['error']> {
    // For security, don't expose internal details in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction && error.statusCode >= 500) {
      return {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        timestamp: error.timestamp.toISOString()
      };
    }
    
    return {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp.toISOString(),
      context: error.context
    };
  }
  
  /**
   * Create standardized error response
   */
  static createErrorResponse(error: BaseAuthError): Response {
    const errorDetails = AuthErrorUtils.getSafeErrorDetails(error);
    
    const response: AuthErrorResponse = {
      success: false,
      error: errorDetails as AuthErrorResponse['error']
    };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Add rate limit headers if applicable
    if (error instanceof AuthRateLimitError) {
      Object.assign(headers, error.getRateLimitHeaders());
    }
    
    return new Response(JSON.stringify(response), {
      status: error.statusCode,
      headers
    });
  }
}

/**
 * Error handler for authentication middleware
 */
export type AuthErrorHandler = (
  error: BaseAuthError,
  context: AuthErrorContext
) => Promise<void> | void;

/**
 * Default error handler that logs errors appropriately
 */
export const defaultAuthErrorHandler: AuthErrorHandler = (error, context) => {
  const logEntry = {
    ...error.toLogEntry(),
    context: {
      ...error.context,
      ...context
    }
  };
  
  if (AuthErrorUtils.isCritical(error)) {
    console.error('Critical auth error:', logEntry);
  } else {
    console.warn('Auth error:', logEntry);
  }
};