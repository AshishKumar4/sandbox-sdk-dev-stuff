/**
 * Consolidated GitHub Types
 * All GitHub-related TypeScript interfaces and types
 */

export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    git_url: string;
    description?: string;
    private: boolean;
    owner: {
        login: string;
        id: number;
        type: 'User' | 'Organization';
    };
    default_branch: string;
    created_at: string;
    updated_at: string;
}

export interface GitHubUser {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
    type: 'User' | 'Organization';
}

export interface GitHubInstallation {
    id: number;
    account: {
        login: string;
        id: number;
        type: 'User' | 'Organization';
    };
    repository_selection: 'all' | 'selected';
    permissions: Record<string, string>;
    created_at: string;
    updated_at: string;
}

export interface GitHubAppToken {
    token: string;
    expires_at: string;
    permissions: Record<string, string>;
    repository_selection?: 'all' | 'selected';
}

export interface GitHubUserAccessToken {
    access_token: string;
    token_type: string;
    scope: string;
    refresh_token?: string;
    expires_in?: number;
}

export interface CreateRepositoryOptions {
    name: string;
    description?: string;
    private: boolean;
    auto_init?: boolean;
    token: string;
}

export interface CreateRepositoryResult {
    success: boolean;
    repository?: GitHubRepository;
    error?: string;
}

export interface GitHubTokenResult {
    success: boolean;
    token?: string;
    expires_at?: string;
    error?: string;
}

export interface GitHubExportOptions {
    repositoryName: string;
    description?: string;
    isPrivate: boolean;
    installationId?: number;
}

export interface GitHubExportResult {
    success: boolean;
    repositoryUrl?: string;
    cloneUrl?: string;
    token?: string;
    error?: string;
}

// Note: GitHubPushRequest and GitHubPushResponse are defined in sandboxTypes.ts
// to maintain proper architectural boundaries between services

export type GitHubTokenType = 'installation' | 'user_access' | 'oauth';

export interface GitHubServiceConfig {
    clientId?: string;
    clientSecret?: string;
}

export class GitHubServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = 'GitHubServiceError';
    }
}