/**
 * Crypto Utils
 * Consolidates cryptographic utilities to eliminate duplication across the codebase
 */

import { createLogger } from '../logger';

const logger = createLogger('CryptoUtils');

/**
 * Centralized cryptographic utilities
 */
export class CryptoUtils {
    
    /**
     * Generate a secure random token
     */
    static generateSecureToken(length: number = 32): string {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generate a UUID v4
     */
    static generateUUID(): string {
        return crypto.randomUUID();
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    static arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Convert ArrayBuffer to Base64URL (URL-safe Base64)
     */
    static arrayBufferToBase64Url(buffer: ArrayBuffer): string {
        const base64 = CryptoUtils.arrayBufferToBase64(buffer);
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Convert Base64URL to ArrayBuffer
     */
    static base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
        // Add padding if needed
        const padded = base64url + '==='.slice(0, (4 - base64url.length % 4) % 4);
        // Convert Base64URL to Base64
        const base64 = padded
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        return CryptoUtils.base64ToArrayBuffer(base64);
    }

    /**
     * Generate encryption key
     */
    static async generateEncryptionKey(): Promise<CryptoKey> {
        try {
            return await crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256,
                },
                true,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            logger.error('Failed to generate encryption key', error);
            throw new Error('Failed to generate encryption key');
        }
    }

    /**
     * Export encryption key to raw format
     */
    static async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
        try {
            return await crypto.subtle.exportKey('raw', key);
        } catch (error) {
            logger.error('Failed to export encryption key', error);
            throw new Error('Failed to export encryption key');
        }
    }

    /**
     * Import encryption key from raw format
     */
    static async importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
        try {
            return await crypto.subtle.importKey(
                'raw',
                keyData,
                {
                    name: 'AES-GCM',
                    length: 256,
                },
                true,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            logger.error('Failed to import encryption key', error);
            throw new Error('Failed to import encryption key');
        }
    }

    /**
     * Encrypt data using AES-GCM
     */
    static async encrypt(key: CryptoKey, data: string): Promise<{ encrypted: ArrayBuffer; iv: ArrayBuffer }> {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            
            // Generate random IV
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv,
                },
                key,
                dataBuffer
            );

            return {
                encrypted,
                iv: iv.buffer
            };
        } catch (error) {
            logger.error('Failed to encrypt data', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt data using AES-GCM
     */
    static async decrypt(key: CryptoKey, encryptedData: ArrayBuffer, iv: ArrayBuffer): Promise<string> {
        try {
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv,
                },
                key,
                encryptedData
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            logger.error('Failed to decrypt data', error);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Generate password hash using PBKDF2
     */
    static async hashPassword(password: string, salt?: ArrayBuffer): Promise<{ hash: ArrayBuffer; salt: ArrayBuffer }> {
        try {
            const encoder = new TextEncoder();
            const passwordBuffer = encoder.encode(password);
            
            // Generate salt if not provided
            const saltBuffer = salt || crypto.getRandomValues(new Uint8Array(16));
            
            // Import password as key material
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                passwordBuffer,
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );

            // Derive hash using PBKDF2
            const hash = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: saltBuffer,
                    iterations: 100000,
                    hash: 'SHA-256',
                },
                keyMaterial,
                256
            );

            return {
                hash,
                salt: saltBuffer
            };
        } catch (error) {
            logger.error('Failed to hash password', error);
            throw new Error('Failed to hash password');
        }
    }

    /**
     * Verify password against hash
     */
    static async verifyPassword(password: string, hash: ArrayBuffer, salt: ArrayBuffer): Promise<boolean> {
        try {
            const result = await CryptoUtils.hashPassword(password, salt);
            
            // Compare hashes in constant time
            const hashArray = new Uint8Array(hash);
            const resultArray = new Uint8Array(result.hash);
            
            if (hashArray.length !== resultArray.length) {
                return false;
            }
            
            let isEqual = true;
            for (let i = 0; i < hashArray.length; i++) {
                if (hashArray[i] !== resultArray[i]) {
                    isEqual = false;
                }
            }
            
            return isEqual;
        } catch (error) {
            logger.error('Failed to verify password', error);
            return false;
        }
    }

    /**
     * Generate cryptographically secure random bytes
     */
    static generateRandomBytes(length: number): Uint8Array {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    }

    /**
     * Convert bytes to hex string
     */
    static bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Convert hex string to bytes
     */
    static hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Generate API key with preview and proper cryptographic hash
     */
    static async generateApiKey(): Promise<{ key: string; keyHash: string; keyPreview: string }> {
        const fullKey = CryptoUtils.generateSecureToken(40);
        const keyHashBuffer = await CryptoUtils.sha256(fullKey);
        const keyHash = CryptoUtils.arrayBufferToBase64(keyHashBuffer);
        const keyPreview = `${fullKey.substring(0, 8)}...${fullKey.substring(-4)}`;
        
        return {
            key: fullKey,
            keyHash,
            keyPreview
        };
    }

    /**
     * Verify API key against stored hash
     */
    static async verifyApiKey(providedKey: string, storedHash: string): Promise<boolean> {
        try {
            const providedKeyHashBuffer = await CryptoUtils.sha256(providedKey);
            const providedKeyHash = CryptoUtils.arrayBufferToBase64(providedKeyHashBuffer);
            return CryptoUtils.constantTimeEqual(providedKeyHash, storedHash);
        } catch (error) {
            logger.error('Failed to verify API key', error);
            return false;
        }
    }

    /**
     * Constant-time string comparison
     */
    static constantTimeEqual(a: string, b: string): boolean {
        if (a.length !== b.length) {
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        
        return result === 0;
    }

    /**
     * Hash data using SHA-256
     */
    static async sha256(data: string): Promise<ArrayBuffer> {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            return await crypto.subtle.digest('SHA-256', dataBuffer);
        } catch (error) {
            logger.error('Failed to hash data with SHA-256', error);
            throw new Error('Failed to hash data');
        }
    }

    /**
     * Generate HMAC signature
     */
    static async generateHMAC(key: string, data: string): Promise<string> {
        try {
            const encoder = new TextEncoder();
            const keyBuffer = encoder.encode(key);
            const dataBuffer = encoder.encode(data);
            
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            
            const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
            return CryptoUtils.arrayBufferToBase64(signature);
        } catch (error) {
            logger.error('Failed to generate HMAC signature', error);
            throw new Error('Failed to generate HMAC signature');
        }
    }

    /**
     * Verify HMAC signature
     */
    static async verifyHMAC(key: string, data: string, signature: string): Promise<boolean> {
        try {
            const expectedSignature = await CryptoUtils.generateHMAC(key, data);
            return CryptoUtils.constantTimeEqual(signature, expectedSignature);
        } catch (error) {
            logger.error('Failed to verify HMAC signature', error);
            return false;
        }
    }
}