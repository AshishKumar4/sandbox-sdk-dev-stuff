/**
 * Token Validator - Lightweight token validation without circular dependencies
 * This is used by middleware to avoid importing the full TokenService
 */

import { jwtVerify } from 'jose';
import { TokenPayload } from '../types/auth-types';
import { createLogger } from '../logger';

const logger = createLogger('TokenValidator');

export class TokenValidator {
    private jwtSecret: Uint8Array;

    constructor(env: { JWT_SECRET: string }) {
        if (!env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }
        this.jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
    }

    /**
     * Verify and decode a JWT token
     */
    async verifyToken(token: string): Promise<TokenPayload | null> {
        try {
            const { payload } = await jwtVerify(token, this.jwtSecret);
            
            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                logger.debug('Token expired', { exp: payload.exp, now });
                return null;
            }
            
            // Validate payload structure
            if (!payload.sub || !payload.email || !payload.type || !payload.exp || !payload.iat) {
                logger.warn('Invalid token payload structure');
                return null;
            }
            
            return {
                sub: payload.sub as string,
                email: payload.email as string,
                type: payload.type as 'access' | 'refresh',
                exp: payload.exp as number,
                iat: payload.iat as number,
                jti: payload.jti as string | undefined
            };
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('signature')) {
                    logger.warn('Invalid token signature');
                } else if (error.message.includes('expired')) {
                    logger.debug('Token expired');
                } else {
                    logger.error('Token verification failed', error);
                }
            }
            return null;
        }
    }

    // extractBearerToken method removed - use extractToken from utils/authUtils.ts instead
}