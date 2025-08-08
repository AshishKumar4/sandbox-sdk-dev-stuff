/**
 * Comprehensive Authentication Type Definitions
 * Centralizes all authentication-related types for better consistency and reusability
 */


/**
 * OAuth provider types
 */
export type OAuthProvider = 'google' | 'github';

/**
 * Enhanced user profile with computed properties
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  isAnonymous: boolean;
  
  // Authentication details
  provider?: OAuthProvider | 'email';
  emailVerified?: boolean;
  
  // Computed properties
  initials?: string;
  lastActiveAt?: Date;
  createdAt?: Date;
  
  // User preferences
  theme?: 'light' | 'dark' | 'system';
  timezone?: string;
  preferences?: Record<string, unknown>;
}

/**
 * Session information with security metadata
 */
export interface AuthSession {
  userId: string;
  email: string;
  sessionId: string;
  expiresAt: Date;
  isAnonymous: boolean;
  
  // Security context
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  lastActivity?: Date;
  
  // Session state
  isRevoked?: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

/**
 * Token payload structure for JWT tokens
 */
export interface TokenPayload {
  // Standard JWT claims
  sub: string; // User ID
  iat: number; // Issued at
  exp: number; // Expires at
  
  // Custom claims
  email: string;
  type: 'access' | 'refresh';
  jti?: string; // JWT ID (for refresh tokens)
  
  // Session context
  sessionId?: string;
  
  // Security metadata
  ipHash?: string; // Hashed IP for security validation
}

/**
 * Authentication result from login/register operations
 */
export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  
  // Session metadata
  sessionId?: string;
  
  // Additional context
  isNewUser?: boolean;
  requiresEmailVerification?: boolean;
}

/**
 * OAuth provider user information
 */
export interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
  locale?: string;
  
  // Provider-specific data
  providerData?: Record<string, unknown>;
}

/**
 * OAuth tokens from provider
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresIn?: number;
  scope?: string;
}

/**
 * OAuth state with security context
 */
export interface OAuthStateData {
  id: string;
  state: string;
  provider: OAuthProvider;
  
  // PKCE security
  codeVerifier?: string;
  codeChallenge?: string;
  challengeMethod?: string;
  
  // Flow context
  redirectUri?: string;
  scopes?: string[];
  nonce?: string;
  
  // User context (for account linking)
  userId?: string;
  
  // Security and expiration
  expiresAt: Date;
  isUsed: boolean;
  
  // Integration flow context
  type?: 'login' | 'integration';
  integrationContext?: Record<string, unknown>;
}

/**
 * API Key with usage metadata
 */
export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  keyPreview: string; // First few characters for display
  
  // Security and access control
  scopes: string[];
  isActive: boolean;
  
  // Usage tracking
  lastUsed?: Date;
  requestCount: number;
  rateLimit?: number;
  
  // Expiration
  expiresAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Authentication attempt for rate limiting and security monitoring
 */
export interface AuthAttempt {
  id: number;
  identifier: string; // Email or username
  attemptType: 'login' | 'register' | 'oauth_google' | 'oauth_github' | 'refresh' | 'reset_password';
  success: boolean;
  
  // Security context
  ipAddress: string;
  userAgent?: string;
  
  // Timing
  attemptedAt: Date;
  
  // Additional context
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Password validation result with strength scoring
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors?: string[];
  score: number; // 0-4 strength score
  
  // Detailed validation
  requirements?: {
    minLength: boolean;
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasNumbers: boolean;
    hasSpecialChars: boolean;
    notCommon: boolean;
    noSequential: boolean;
  };
  
  // Suggestions for improvement
  suggestions?: string[];
}

/**
 * Rate limiting configuration and state
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxAttempts: number; // Max attempts per window
  
  // Escalation policy
  blockDurationMs?: number; // How long to block after max attempts
  escalationMultiplier?: number; // Multiply block duration on repeated violations
  
  // Context-specific limits
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  
  // Custom key generation
  keyGenerator?: (request: Request) => string;
}

/**
 * Rate limiting state for a specific identifier
 */
export interface RateLimitState {
  identifier: string;
  attempts: number;
  windowStart: Date;
  isBlocked: boolean;
  blockUntil?: Date;
  
  // Violation tracking
  totalViolations: number;
  lastViolation?: Date;
}

/**
 * Security context for authentication operations
 */
export interface SecurityContext {
  // Request metadata
  ipAddress: string;
  userAgent: string;
  requestId: string;
  
  // Geographic and network info
  country?: string;
  region?: string;
  isp?: string;
  
  // Device fingerprinting
  deviceFingerprint?: string;
  
  // Risk assessment
  riskScore?: number; // 0-100
  riskFactors?: string[];
  
  // Rate limiting state
  rateLimitState?: RateLimitState;
}

/**
 * Audit log entry for compliance and security monitoring
 */
export interface AuditLogEntry {
  id: string;
  
  // What happened
  entityType: string; // 'user', 'session', 'apikey', etc.
  entityId: string;
  action: string; // 'create', 'update', 'delete', 'login', etc.
  
  // Who did it
  userId?: string;
  
  // Change details
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  securityContext?: Partial<SecurityContext>;
  
  // Metadata
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Session cleanup configuration and statistics
 */
export interface SessionCleanupConfig {
  // Cleanup intervals
  expiredSessionCleanupInterval: number; // How often to clean expired sessions
  inactiveSessionTimeout: number; // How long before inactive sessions are removed
  maxSessionsPerUser: number; // Maximum concurrent sessions per user
  
  // Security policies
  forceLogoutOnSuspiciousActivity: boolean;
  sessionHijackingDetection: boolean;
  
  // Cleanup statistics
  lastCleanupRun?: Date;
  sessionsCleanedUp?: number;
  errorsEncountered?: number;
}

/**
 * User profile update request with validation
 */
export interface UserProfileUpdate {
  displayName?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  theme?: 'light' | 'dark' | 'system';
  timezone?: string;
  preferences?: Record<string, unknown>;
  
  // Email change (requires verification)
  newEmail?: string;
  emailChangeToken?: string;
}

/**
 * Password change request with security validation
 */
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  
  // Security context
  logoutOtherSessions?: boolean;
  
  // MFA verification (future)
  mfaToken?: string;
}

/**
 * Account recovery request
 */
export interface AccountRecoveryRequest {
  email: string;
  
  // Recovery method
  method: 'email' | 'sms' | 'backup_codes';
  
  // Context for security
  userAgent?: string;
  ipAddress?: string;
  
  // Rate limiting
  requestedAt: Date;
  expiresAt: Date;
  
  // Security verification
  verificationCode?: string;
  isUsed: boolean;
}

/**
 * Team/organization member with role-based permissions
 */
export interface TeamMemberInfo {
  id: string;
  userId: string;
  teamId: string;
  
  // Role and permissions
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
  
  // Invitation details
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  
  // Member status
  status: 'pending' | 'active' | 'suspended';
  
  // User details (joined from users table)
  user?: {
    email: string;
    displayName?: string;
    avatarUrl?: string;
    lastActiveAt?: Date;
  };
}

/**
 * Integration configuration (GitHub, etc.)
 */
export interface IntegrationConfig {
  id: string;
  userId?: string;
  teamId?: string;
  
  // Integration details
  provider: 'github' | 'gitlab' | 'bitbucket';
  providerUserId: string;
  providerUsername: string;
  
  // Token management
  accessTokenHash: string;
  refreshTokenHash?: string;
  tokenExpiresAt?: Date;
  
  // Configuration
  scopes: string[];
  isActive: boolean;
  
  // Usage
  lastUsed?: Date;
  lastValidated?: Date;
  validationStatus: 'valid' | 'invalid' | 'pending';
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}