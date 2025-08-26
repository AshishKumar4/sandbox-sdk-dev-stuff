/**
 * Centralized Authentication Utilities
 * Contains common auth functions to eliminate code duplication
 * 
 * This module provides all authentication-related utility functions
 * to ensure consistency and avoid duplicate code across the application.
 */

import { OAuthProvider } from '../types/auth-types';


/**
 * Token extraction priorities and methods
 */
export enum TokenExtractionMethod {
  AUTHORIZATION_HEADER = 'authorization_header',
  COOKIE = 'cookie',
  QUERY_PARAMETER = 'query_parameter'
}

/**
 * Result of token extraction with metadata
 */
export interface TokenExtractionResult {
  token: string | null;
  method?: TokenExtractionMethod;
  cookieName?: string;
}

/**
 * Extract JWT token from request with multiple fallback methods
 * Prioritizes Authorization header, then cookies, then query parameters
 */
export function extractToken(request: Request): string | null {
  const result = extractTokenWithMetadata(request);
  return result.token;
}

/**
 * Extract JWT token from request with extraction method metadata
 * Useful for security logging and analysis
 */
export function extractTokenWithMetadata(request: Request): TokenExtractionResult {
  // Priority 1: Authorization header (most secure)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token && token.length > 0) {
      return {
        token,
        method: TokenExtractionMethod.AUTHORIZATION_HEADER
      };
    }
  }
  
  // Priority 2: Cookies (secure for browser requests)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    
    // Check common cookie names in order of preference
    const cookieNames = ['accessToken', 'auth_token', 'jwt'];
    for (const cookieName of cookieNames) {
      if (cookies[cookieName]) {
        return {
          token: cookies[cookieName],
          method: TokenExtractionMethod.COOKIE,
          cookieName
        };
      }
    }
  }
  
  // Priority 3: Query parameter (for WebSocket connections and special cases)
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token') || url.searchParams.get('access_token');
  if (queryToken && queryToken.length > 0) {
    return {
      token: queryToken,
      method: TokenExtractionMethod.QUERY_PARAMETER
    };
  }
  
  return { token: null };
}

/**
 * Extract refresh token from request (cookies only for security)
 */
export function extractRefreshToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }
  
  const cookies = parseCookies(cookieHeader);
  return cookies['refreshToken'] || cookies['refresh_token'] || null;
}

/**
 * Parse cookie header into key-value pairs
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  
  for (const pair of pairs) {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  
  return cookies;
}

/**
 * Clear authentication cookie using secure cookie options
 */
export function clearAuthCookie(name: string): string {
  return createSecureCookie({
    name,
    value: '',
    maxAge: 0
  });
}

/**
 * Clear all auth cookies from response using consolidated approach
 */
export function clearAuthCookies(response: Response): void {
  response.headers.append('Set-Cookie', clearAuthCookie('accessToken'));
  response.headers.append('Set-Cookie', clearAuthCookie('refreshToken'));
  response.headers.append('Set-Cookie', clearAuthCookie('auth_token'));
}

/**
 * Extract bearer token from Authorization header (simplified version)
 * @deprecated Use extractToken() or extractTokenWithMetadata() instead
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Create standardized auth headers for API requests
 */
export function createAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Enhanced cookie creation with security options
 */
export interface CookieOptions {
  name: string;
  value: string;
  maxAge?: number; // seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
  domain?: string;
}

/**
 * Create secure cookie string with all options
 */
export function createSecureCookie(options: CookieOptions): string {
  const {
    name,
    value,
    maxAge = 7 * 24 * 60 * 60, // 7 days default
    httpOnly = true,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'Lax',
    path = '/',
    domain
  } = options;

  const parts = [`${name}=${encodeURIComponent(value)}`];
  
  if (maxAge > 0) parts.push(`Max-Age=${maxAge}`);
  if (path) parts.push(`Path=${path}`);
  if (domain) parts.push(`Domain=${domain}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  
  return parts.join('; ');
}

/**
 * Set auth cookies with proper security settings
 */
export function setSecureAuthCookies(
  response: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiry?: number; // seconds
    refreshTokenExpiry?: number; // seconds
  }
): void {
  const {
    accessToken,
    refreshToken,
    accessTokenExpiry = 24 * 60 * 60, // 24 hours (1 day)
    refreshTokenExpiry = 7 * 24 * 60 * 60 // 7 days
  } = tokens;

  // Set access token cookie
  response.headers.append(
    'Set-Cookie',
    createSecureCookie({
      name: 'accessToken',
      value: accessToken,
      maxAge: accessTokenExpiry,
      httpOnly: true,
      sameSite: 'Lax'
    })
  );

  // Set refresh token cookie with higher security
  response.headers.append(
    'Set-Cookie',
    createSecureCookie({
      name: 'refreshToken',
      value: refreshToken,
      maxAge: refreshTokenExpiry,
      httpOnly: true,
      sameSite: 'Strict' // More restrictive for refresh tokens
    })
  );
}

/**
 * Extract request metadata for security analysis
 */
export interface RequestMetadata {
  ipAddress: string;
  userAgent: string;
  referer?: string;
  origin?: string;
  acceptLanguage?: string;
  
  // Cloudflare-specific headers
  cfConnectingIp?: string;
  cfRay?: string;
  cfCountry?: string;
  cfTimezone?: string;
}

/**
 * Extract comprehensive request metadata
 */
export function extractRequestMetadata(request: Request): RequestMetadata {
  const headers = request.headers;
  
  return {
    ipAddress: headers.get('CF-Connecting-IP') || 
               headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
               headers.get('X-Real-IP') || 
               'unknown',
    userAgent: headers.get('User-Agent') || 'unknown',
    referer: headers.get('Referer') || undefined,
    origin: headers.get('Origin') || undefined,
    acceptLanguage: headers.get('Accept-Language') || undefined,
    
    // Cloudflare-specific
    cfConnectingIp: headers.get('CF-Connecting-IP') || undefined,
    cfRay: headers.get('CF-Ray') || undefined,
    cfCountry: headers.get('CF-IPCountry') || undefined,
    cfTimezone: headers.get('CF-Timezone') || undefined
  };
}

/**
 * Validate token format (basic structure check)
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // JWT tokens have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  // Each part should be base64url encoded (no padding)
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  return parts.every(part => part.length > 0 && base64UrlRegex.test(part));
}

/**
 * Create session response with consistent format
 */
export interface SessionResponse {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  session?: {
    id: string;
    expiresAt: string;
  };
  expiresIn?: number;
}

/**
 * User response interface matching frontend expectations
 */
export interface UserResponse {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  isAnonymous: boolean;
  emailVerified?: boolean;
  provider?: OAuthProvider | 'email';
  createdAt?: Date;
  lastActiveAt?: Date;
  theme?: 'light' | 'dark' | 'system';
  timezone?: string;
}

/**
 * Centralized user response mapper - single source of truth for user data formatting
 * Ensures all endpoints return consistent user data structure
 */
export function mapUserResponse(dbUser: {
  id: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  emailVerified?: boolean | null;
  provider?: string | null;
  createdAt?: Date | null;
  lastActiveAt?: Date | null;
  theme?: string | null;
  timezone?: string | null;
}): UserResponse {
  return {
    id: dbUser.id,
    email: dbUser.email,
    displayName: dbUser.displayName || undefined,
    username: dbUser.username || undefined,
    avatarUrl: dbUser.avatarUrl || undefined,
    bio: dbUser.bio || undefined,
    isAnonymous: false, // Regular database users are never anonymous
    emailVerified: dbUser.emailVerified || false,
    provider: (dbUser.provider as OAuthProvider | 'email') || 'email',
    createdAt: dbUser.createdAt || undefined,
    lastActiveAt: dbUser.lastActiveAt || undefined,
    theme: (dbUser.theme as 'light' | 'dark' | 'system') || 'system',
    timezone: dbUser.timezone || 'UTC'
  };
}

/**
 * Format authentication response consistently
 */
export function formatAuthResponse(
  user: UserResponse | { id: string; email: string; displayName?: string },
  session?: { id: string; expiresAt: Date },
  expiresIn?: number
): SessionResponse {
  const response: SessionResponse = { user };
  
  if (session) {
    response.session = {
      id: session.id,
      expiresAt: session.expiresAt.toISOString()
    };
  }
  
  if (expiresIn) {
    response.expiresIn = expiresIn;
  }
  
  return response;
}

// ==========================================
// GITHUB-SPECIFIC UTILITIES
// ==========================================

/**
 * Create standardized GitHub API headers with consistent User-Agent
 * Consolidates GitHub header creation to eliminate duplication
 */
export function createGitHubHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `token ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-OrangeBuild-OAuth-Integration/1.0'
  };
}

/**
 * Validate GitHub token format and presence
 * Consolidates token validation logic to eliminate duplication
 */
export function isValidGitHubToken(token: string | undefined): token is string {
  return !!(token && 
           typeof token === 'string' && 
           token.trim().length > 0 && 
           token.length > 10); // GitHub tokens are much longer than 10 chars
}

// ==========================================
// OAUTH STATE UTILITIES
// ==========================================

/**
 * Encode OAuth state object to base64 string
 * Consolidates state encoding logic to eliminate duplication
 */
export function encodeOAuthState(state: Record<string, unknown>): string {
  try {
    const stateString = JSON.stringify(state);
    return btoa(stateString);
  } catch (error) {
    throw new Error('Failed to encode OAuth state');
  }
}

/**
 * Decode base64 OAuth state string to object
 * Consolidates state decoding logic to eliminate duplication
 */
export function decodeOAuthState<T = Record<string, unknown>>(encodedState: string): T {
  try {
    const stateString = atob(encodedState);
    return JSON.parse(stateString) as T;
  } catch (error) {
    throw new Error('Failed to decode OAuth state');
  }
}

// ==========================================
// GITHUB API ERROR HANDLING
// ==========================================

/**
 * Extract error text from GitHub API response
 * Consolidates error response handling to eliminate duplication
 */
export async function extractGitHubErrorText(response: Response): Promise<string> {
  try {
    // Try to parse as JSON first (GitHub usually returns JSON errors)
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const errorData = await response.json() as { message?: string; error?: string };
      return errorData.message || errorData.error || `HTTP ${response.status}`;
    } else {
      // Fallback to plain text
      const errorText = await response.text();
      return errorText || `HTTP ${response.status}`;
    }
  } catch (parseError) {
    // If parsing fails, return generic error
    return `HTTP ${response.status}`;
  }
}

// ==========================================
// GITHUB SCOPES VALIDATION
// ==========================================

/**
 * Valid GitHub OAuth scopes with proper TypeScript typing
 */
export type GitHubScope = 'repo' | 'user:email' | 'read:user' | 'user' | 'gist' | 'admin:org';

/**
 * Validate GitHub scopes array with proper TypeScript typing
 * Consolidates scopes validation to eliminate duplication and ensure type safety
 */
export function validateGitHubScopes(scopes: string[]): GitHubScope[] {
  const validScopes: GitHubScope[] = ['repo', 'user:email', 'read:user', 'user', 'gist', 'admin:org'];
  
  return scopes.filter((scope): scope is GitHubScope => {
    return validScopes.includes(scope as GitHubScope);
  });
}