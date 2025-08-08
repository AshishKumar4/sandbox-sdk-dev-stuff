/**
 * Security-related TypeScript types for the application
 * These types ensure type safety across all security implementations
 */

import { z } from 'zod';
import type { AuthUser, AuthSession, OAuthProvider } from './auth-types';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    requests: number;
    window: string | number; // '1h', '15m', or milliseconds
    by: 'ip' | 'user' | 'session';
}

/**
 * Route security configuration
 */
export interface RouteSecurityConfig {
    rateLimit?: RateLimitConfig;
    requireAuth: boolean;
    validation?: z.ZodSchema;
    requiredScopes?: string[];
    authorization?: string; // Custom authorization function name
    bruteForceProtection?: boolean;
}

/**
 * Security context passed through middleware
 */
export interface SecurityContext {
    user?: AuthUser;
    session?: AuthSession;
    requestId: string;
    clientIp: string;
}


/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
    provider: OAuthProvider;
    state: string;
    codeVerifier?: string; // For PKCE
    redirectUri: string;
    createdAt: Date;
}


/**
 * Security error types for proper error handling
 */
export enum SecurityErrorType {
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    INVALID_TOKEN = 'INVALID_TOKEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_INPUT = 'INVALID_INPUT',
    CSRF_VIOLATION = 'CSRF_VIOLATION',
}

/**
 * Custom security error class
 */
export class SecurityError extends Error {
    public code: string;
    
    constructor(
        public type: SecurityErrorType,
        message: string,
        public statusCode: number = 401
    ) {
        super(message);
        this.name = 'SecurityError';
        this.code = type;
    }
}

/**
 * Validated environment configuration
 */
export interface ValidatedEnv {
    db: D1Database;
    codeGenObject: DurableObjectNamespace;
    jwtSecret: string;
    runnerService?: Fetcher;
    environment: 'development' | 'staging' | 'production';
    disableRateLimiting?: boolean;
}