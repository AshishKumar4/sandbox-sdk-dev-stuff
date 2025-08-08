/**
 * JWT Token Service using Web Crypto API
 * Provides secure token generation and validation for Cloudflare Workers
 */

import { TokenPayload } from '../types/auth-types';
import { SecurityError, SecurityErrorType } from '../types/security';
import { createLogger } from '../logger';
import { TokenValidator } from './tokenValidator';
import { CryptoUtils } from '../utils/CryptoUtils';

const logger = createLogger('TokenService');

/**
 * JWT header type
 */
interface JWTHeader {
    alg: string;
    typ: string;
}

/**
 * Token Service for JWT operations using Web Crypto API
 */
export class TokenService {
    private readonly algorithm = 'HS256';
    private readonly encoder = new TextEncoder();
    
    constructor(private env: Env) {
        if (!env.JWT_SECRET) {
            throw new Error('JWT_SECRET not configured');
        }
    }
    
    /**
     * Create a new JWT token
     */
    async createToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn: number = 3600): Promise<string> {
        try {
            const now = Math.floor(Date.now() / 1000);
            
            const fullPayload: TokenPayload = {
                ...payload,
                iat: now,
                exp: now + expiresIn
            };
            
            // Create header
            const header: JWTHeader = {
                alg: this.algorithm,
                typ: 'JWT'
            };
            
            // Encode header and payload
            const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
            const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));
            
            // Create signature
            const signatureInput = `${encodedHeader}.${encodedPayload}`;
            const signature = await this.sign(signatureInput);
            
            // Combine all parts
            const token = `${signatureInput}.${signature}`;
            
            logger.debug('Token created', { 
                userId: payload.sub, 
                type: payload.type,
                expiresIn 
            });
            
            return token;
        } catch (error) {
            logger.error('Error creating token', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_TOKEN,
                'Failed to create token',
                500
            );
        }
    }
    
    /**
     * Verify and decode a JWT token (using standardized TokenValidator)
     */
    async verifyToken(token: string): Promise<TokenPayload | null> {
        const tokenValidator = new TokenValidator(this.env);
        return tokenValidator.verifyToken(token);
    }
    
    /**
     * Create access and refresh tokens
     */
    async createTokenPair(userId: string, email: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }> {
        const accessTokenExpiry = 3600; // 1 hour
        const refreshTokenExpiry = 7 * 24 * 3600; // 7 days
        
        const [accessToken, refreshToken] = await Promise.all([
            this.createToken({
                sub: userId,
                email,
                type: 'access'
            }, accessTokenExpiry),
            
            this.createToken({
                sub: userId,
                email,
                type: 'refresh',
                jti: crypto.randomUUID() // Unique ID for refresh token
            }, refreshTokenExpiry)
        ]);
        
        return {
            accessToken,
            refreshToken,
            expiresIn: accessTokenExpiry
        };
    }
    
    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken: string): Promise<{
        accessToken: string;
        expiresIn: number;
    } | null> {
        const payload = await this.verifyToken(refreshToken);
        
        if (!payload || payload.type !== 'refresh') {
            logger.warn('Invalid refresh token');
            return null;
        }
        
        // Create new access token
        const accessToken = await this.createToken({
            sub: payload.sub,
            email: payload.email,
            type: 'access'
        });
        
        return {
            accessToken,
            expiresIn: 3600
        };
    }
    
    /**
     * Sign data using HMAC with Web Crypto API
     */
    private async sign(data: string): Promise<string> {
        // Import key from JWT secret
        const key = await crypto.subtle.importKey(
            'raw',
            this.encoder.encode(this.env.JWT_SECRET),
            {
                name: 'HMAC',
                hash: 'SHA-256'
            },
            false,
            ['sign']
        );
        
        // Sign the data
        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            this.encoder.encode(data)
        );
        
        // Convert to base64url
        return this.arrayBufferToBase64Url(signature);
    }
    
    /**
     * Base64 URL encode
     */
    private base64UrlEncode(data: string): string {
        const base64 = btoa(data);
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    
    // base64UrlDecode method removed - no longer needed after switching to TokenValidator
    
    /**
     * Convert ArrayBuffer to base64url
     */
    private arrayBufferToBase64Url(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return this.base64UrlEncode(binary);
    }
    
    /**
     * Generate a secure random token (for CSRF, etc.)
     */
    async generateSecureToken(length: number = 32): Promise<string> {
        return CryptoUtils.generateSecureToken(length);
    }
    
    /**
     * Hash a token for storage (e.g., refresh tokens)
     */
    async hashToken(token: string): Promise<string> {
        const hash = await CryptoUtils.sha256(token);
        return CryptoUtils.arrayBufferToBase64Url(hash);
    }

    /**
     * Generate an API key with proper format and security
     */
    async generateApiKey(): Promise<{
        key: string;
        keyHash: string;
        keyPreview: string;
    }> {
        // Use consolidated crypto utilities
        return CryptoUtils.generateApiKey();
    }

    /**
     * Verify an API key against its hash
     */
    async verifyApiKey(providedKey: string, storedHash: string): Promise<boolean> {
        try {
            const providedHash = await this.hashToken(providedKey);
            return providedHash === storedHash;
        } catch (error) {
            logger.error('Error verifying API key', error);
            return false;
        }
    }
}