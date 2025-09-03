/**
 * GitHub Service - Secure API-based GitHub operations
 */

import { Octokit } from '@octokit/rest';
import { createLogger } from '../logger';
import {
    GitHubRepository,
    CreateRepositoryOptions,
    CreateRepositoryResult,
    GitHubServiceError,
} from './types';
import { GitHubPushRequest, GitHubPushResponse } from '../sandbox/sandboxTypes';

interface FileContent {
    filePath: string;
    fileContents: string;
}

interface LocalCommit {
    hash: string;
    message: string;
    timestamp: string;
}

interface GitContext {
    localCommits: LocalCommit[];
    hasUncommittedChanges: boolean;
}

interface RemoteCommit {
    sha: string;
    message: string;
    date: string;
}

interface GitHubTree {
    path: string;
    mode: '100644' | '100755' | '040000' | '160000' | '120000';
    type: 'blob' | 'tree' | 'commit';
    sha?: string;
    content?: string;
}


export class GitHubService {
    private static readonly logger = createLogger('GitHubService');

    private static createHeaders(token: string, includeContentType = false): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'v1dev/1.0',
        };

        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }

        return headers;
    }

    private static createOctokit(token: string): Octokit {
        if (!token?.trim()) {
            throw new GitHubServiceError('No GitHub token provided', 'NO_TOKEN');
        }
        return new Octokit({ auth: token });
    }
    /**
     * Create a new repository for user account
     */
    static async createUserRepository(
        options: CreateRepositoryOptions
    ): Promise<CreateRepositoryResult> {
        const autoInit = options.auto_init ?? true;
        
        GitHubService.logger.info('Creating GitHub repository', {
            name: options.name,
            private: options.private,
            auto_init: autoInit,
            description: options.description ? 'provided' : 'none'
        });
        
        try {
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: GitHubService.createHeaders(options.token, true),
                body: JSON.stringify({
                    name: options.name,
                    description: options.description,
                    private: options.private,
                    auto_init: autoInit,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                GitHubService.logger.error('Repository creation failed', {
                    status: response.status,
                    statusText: response.statusText,
                    error: error,
                    endpoint: 'https://api.github.com/user/repos'
                });
                
                if (response.status === 403) {
                    return {
                        success: false,
                        error: `GitHub App lacks required permissions. Please ensure the app has 'Contents: Write' and 'Metadata: Read' permissions, then re-install it.`
                    };
                }
                
                return {
                    success: false,
                    error: `Failed to create repository: ${error}`
                };
            }

            const repository = (await response.json()) as GitHubRepository;
            GitHubService.logger.info(`Successfully created repository: ${repository.html_url}`);

            return {
                success: true,
                repository
            };
        } catch (error) {
            GitHubService.logger.error('Failed to create user repository', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Push files to GitHub repository with intelligent commit history preservation
     */
    static async pushFilesToRepository(
        files: FileContent[],
        request: GitHubPushRequest,
        gitContext?: GitContext
    ): Promise<GitHubPushResponse> {
        try {
            GitHubService.logger.info('Starting GitHub push with history analysis', {
                repositoryUrl: request.repositoryHtmlUrl,
                fileCount: files.length,
                localCommitCount: gitContext?.localCommits?.length || 0,
                hasUncommittedChanges: gitContext?.hasUncommittedChanges || false
            });

            const octokit = GitHubService.createOctokit(request.token);
            
            // Parse repository info from URL
            const repoInfo = GitHubService.extractRepoInfo(request.cloneUrl || request.repositoryHtmlUrl);
            if (!repoInfo) {
                throw new GitHubServiceError('Invalid repository URL format', 'INVALID_REPO_URL');
            }

            const { owner, repo } = repoInfo;

            // Get repository metadata
            const { data: repository } = await octokit.rest.repos.get({ owner, repo });
            const defaultBranch = repository.default_branch || 'main';

            // Fetch remote commit history
            const remoteCommits = await GitHubService.fetchRemoteCommits(octokit, owner, repo, defaultBranch);
            
            // Determine base commit SHA - handle both auto-initialized and empty repositories
            const parentCommitSha = remoteCommits.length > 0 ? remoteCommits[0].sha : '';
            
            GitHubService.logger.info('Repository state analyzed', {
                defaultBranch,
                remoteCommitCount: remoteCommits.length,
                hasParentCommit: !!parentCommitSha,
                repositoryEmpty: remoteCommits.length === 0
            });

            // Plan commit strategy
            const commitStrategy = GitHubService.planCommitStrategy(gitContext, remoteCommits, files);
            
            GitHubService.logger.info('Commit strategy planned', {
                strategy: commitStrategy.type,
                commitsToCreate: commitStrategy.commits.length,
                remoteCommitCount: remoteCommits.length
            });
            
            if (files.length === 0) {
                GitHubService.logger.warn('No files to commit');
                return { success: true, commitSha: parentCommitSha };
            }

            if (commitStrategy.commits.length === 0) {
                GitHubService.logger.info('No commits needed - repository is already in sync');
                return { success: true, commitSha: parentCommitSha };
            }

            // Execute commit strategy
            const finalCommitSha = await GitHubService.executeCommitStrategy(
                octokit, owner, repo, defaultBranch, commitStrategy, parentCommitSha, request
            );

            GitHubService.logger.info('GitHub push completed', {
                repositoryUrl: request.repositoryHtmlUrl,
                finalCommitSha,
                strategy: commitStrategy.type,
                commitsCreated: commitStrategy.commits.length
            });

            return {
                success: true,
                commitSha: finalCommitSha
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            GitHubService.logger.error('Failed to push files to GitHub', {
                error: errorMessage,
                repositoryUrl: request.repositoryHtmlUrl,
                fileCount: files.length
            });

            return {
                success: false,
                error: `GitHub push failed: ${errorMessage}`,
                details: {
                    operation: 'intelligent_push',
                    stderr: errorMessage
                }
            };
        }
    }

    /**
     * Fetch remote commit history from GitHub
     */
    private static async fetchRemoteCommits(
        octokit: Octokit, 
        owner: string, 
        repo: string, 
        branch: string
    ): Promise<RemoteCommit[]> {
        try {
            const { data: commits } = await octokit.rest.repos.listCommits({
                owner,
                repo,
                sha: branch,
                per_page: 100 // Get recent history
            });

            return commits.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                date: commit.commit.author?.date || new Date().toISOString()
            }));
        } catch (error) {
            const githubError = error as { status?: number };
            if (githubError.status === 409 || githubError.status === 404) {
                // Empty repository or branch doesn't exist
                GitHubService.logger.info('Remote repository is empty or branch does not exist');
                return [];
            }
            throw error;
        }
    }

    /**
     * Plan commit strategy based on local vs remote state
     */
    private static planCommitStrategy(
        gitContext: GitContext | undefined,
        remoteCommits: RemoteCommit[],
        files: FileContent[]
    ): {
        type: 'single_commit' | 'multi_commit' | 'incremental';
        commits: Array<{
            message: string;
            timestamp: string;
            files: FileContent[];
        }>;
    } {
        const localCommits = gitContext?.localCommits || [];
        
        // Strategy 1: No local history - single commit
        if (localCommits.length === 0) {
            return {
                type: 'single_commit',
                commits: [{
                    message: 'Generated app',
                    timestamp: new Date().toISOString(),
                    files
                }]
            };
        }

        // Strategy 2: Remote is empty - push all local commits
        if (remoteCommits.length === 0) {
            return {
                type: 'multi_commit',
                commits: localCommits.map(commit => ({
                    message: commit.message,
                    timestamp: commit.timestamp,
                    files // All files in final commit (simplified)
                }))
            };
        }

        // Strategy 3: Both exist - find what's new and create incremental commits
        const newLocalCommits = localCommits.filter(local => 
            !remoteCommits.some(remote => remote.message === local.message)
        );

        if (newLocalCommits.length > 0) {
            return {
                type: 'incremental',
                commits: newLocalCommits.map(commit => ({
                    message: commit.message,
                    timestamp: commit.timestamp,
                    files // All files in final state (simplified)
                }))
            };
        }

        // Strategy 4: Everything is in sync - only commit if there are uncommitted changes
        if (gitContext?.hasUncommittedChanges) {
            return {
                type: 'single_commit',
                commits: [{
                    message: 'Update generated app',
                    timestamp: new Date().toISOString(),
                    files
                }]
            };
        }

        // Strategy 5: Everything is perfectly in sync - no commit needed
        return {
            type: 'single_commit',
            commits: []
        };
    }

    /**
     * Execute the planned commit strategy
     */
    private static async executeCommitStrategy(
        octokit: Octokit,
        owner: string,
        repo: string,
        branch: string,
        strategy: ReturnType<typeof GitHubService.planCommitStrategy>,
        initialParentSha: string,
        request: GitHubPushRequest
    ): Promise<string> {
        let parentCommitSha = initialParentSha;

        for (const commitPlan of strategy.commits) {
            if (!parentCommitSha) {
                // Empty repository - create README to bootstrap, then use normal flow
                GitHubService.logger.info('Bootstrapping empty repository with README', { 
                    owner, repo, branch
                });
                
                const { data: readmeCommit } = await octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: 'README.md',
                    message: 'Initial commit',
                    content: Buffer.from('# Generated App\n\n🤖 Generated with v1dev', 'utf8').toString('base64'),
                    branch,
                    author: {
                        name: request.username || 'v1dev-bot',
                        email: request.email || 'noreply@v1dev.com'
                    },
                    committer: {
                        name: request.username || 'v1dev-bot',
                        email: request.email || 'noreply@v1dev.com'
                    }
                });

                if (!readmeCommit.commit.sha) {
                    throw new GitHubServiceError('Failed to get commit SHA from README creation', 'COMMIT_SHA_MISSING');
                }
                parentCommitSha = readmeCommit.commit.sha;
                
                GitHubService.logger.info('Empty repository bootstrapped, proceeding with normal tree-based flow', { 
                    owner, repo,
                    bootstrapCommitSha: parentCommitSha 
                });
                
                // Now fall through to use the normal tree-based approach below
            }
            
            // Repository has commits (either existing or just bootstrapped) - use tree-based approach
            GitHubService.logger.info('Creating tree-based commit', { 
                owner, repo, 
                baseTreeSha: parentCommitSha,
                fileCount: commitPlan.files.length 
            });
            
            // Create tree entries for all files
            const treeEntries: GitHubTree[] = commitPlan.files.map(file => ({
                path: file.filePath,
                mode: '100644',
                type: 'blob',
                content: file.fileContents
            }));

            const { data: tree } = await octokit.rest.git.createTree({
                owner,
                repo,
                tree: treeEntries,
                base_tree: parentCommitSha
            });

            // Create commit info
            const commitInfo = {
                message: commitPlan.message,
                author: {
                    name: request.username || 'v1dev-bot',
                    email: request.email || 'noreply@v1dev.com',
                    date: commitPlan.timestamp
                },
                committer: {
                    name: request.username || 'v1dev-bot', 
                    email: request.email || 'noreply@v1dev.com',
                    date: commitPlan.timestamp
                }
            };

            // Create the commit
            const { data: commit } = await octokit.rest.git.createCommit({
                owner,
                repo,
                message: commitInfo.message,
                tree: tree.sha,
                parents: [parentCommitSha],
                author: commitInfo.author,
                committer: commitInfo.committer
            });

            parentCommitSha = commit.sha;

            // Update branch reference
            await octokit.rest.git.updateRef({
                owner,
                repo,
                ref: `heads/${branch}`,
                sha: parentCommitSha,
                force: true
            });
        }

        return parentCommitSha;
    }

    /**
     * Extract owner and repo from GitHub URL
     */
    private static extractRepoInfo(url: string): { owner: string; repo: string } | null {
        try {
            // Handle different URL formats:
            // https://github.com/owner/repo.git
            // https://github.com/owner/repo
            // git@github.com:owner/repo.git
            let cleanUrl = url;
            
            if (url.startsWith('git@github.com:')) {
                cleanUrl = url.replace('git@github.com:', 'https://github.com/');
            }
            
            const urlObj = new URL(cleanUrl);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            if (pathParts.length >= 2) {
                const owner = pathParts[0];
                const repo = pathParts[1].replace('.git', '');
                return { owner, repo };
            }
            
            return null;
        } catch (error) {
            GitHubService.logger.error('Failed to parse repository URL', { url, error });
            return null;
        }
    }


}