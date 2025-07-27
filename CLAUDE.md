# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Cloudflare Workers Commands
- `npm run dev` or `npm start` - Start Wrangler development server 
- `npm run deploy` - Deploy the worker to Cloudflare
- `npm run cf-typegen` - Generate Cloudflare Workers types

### Key Dependencies
- **Wrangler**: Cloudflare Workers CLI for development and deployment
- **@cloudflare/sandbox**: Core sandbox SDK for containerized code execution
- **TypeScript**: Strict type checking enabled
- **Bun**: Used inside sandbox containers for package management and runtime

## Architecture Overview

This is a **Cloudflare Workers project** that provides a **sandbox execution service** using Cloudflare's container runtime. The worker acts as an API layer for managing sandboxed development environments.

### Core Components

**Main Worker (`src/index.ts`)**
- Entry point that exports the Cloudflare Durable Object `Sandbox` class
- Basic request handler that demonstrates sandbox file operations

**Sandbox SDK Client (`src/sandboxSdkClient.ts`)**
- Complete API implementation for sandbox instance management
- Handles template-based project creation, file operations, command execution
- Supports GitHub integration, Cloudflare Workers deployment
- Built on the `@cloudflare/sandbox` SDK for container operations

**Base Service (`src/base.ts`)**
- Abstract base class defining the complete service contract
- Ensures API compatibility across different implementations
- Includes methods for templates, instances, files, commands, analysis, deployment

**Type Definitions (`src/types.ts`)**
- Comprehensive Zod schemas for all API request/response types
- Includes webhook event types for runtime error reporting
- GitHub integration types for repository management

**Logging System (`src/logger/`)**
- Production-grade structured logging with context injection
- Automatic tracing and performance measurement
- Request-scoped context management for distributed tracing

### Configuration Files

**Wrangler Config (`wrangler.jsonc`)**
- Defines the sandbox container configuration using Docker
- Sets up Durable Objects binding for persistent sandbox instances
- Configures environment variables (template bucket URL)
- Enables observability features

**Container Setup (`Dockerfile`)**
- Based on `cloudflare/sandbox:0.1.3` image with Bun runtime
- Exposes port 3000 for development servers
- ARM64 compatible image available for M1/M2 Macs

## Sandbox Service Architecture

The service manages **template-based development instances**:

1. **Templates**: Pre-configured project structures stored in R2 bucket
2. **Instances**: Running sandbox containers created from templates
3. **File Operations**: Read/write files within sandbox containers
4. **Command Execution**: Run shell commands with streaming output
5. **Error Management**: Track and report runtime errors
6. **Analysis**: Lint and type-check code within instances
7. **Deployment**: Deploy instances to Cloudflare Workers
8. **GitHub Integration**: Initialize repos and push code

### Key Patterns

**Durable Objects**: Each sandbox instance uses Cloudflare Durable Objects for persistence and state management.

**Container Management**: Sandboxes run inside secure containers with isolated filesystems and processes.

**Template System**: Projects are bootstrapped from downloadable ZIP templates containing starter code.

**Streaming Execution**: Commands can be executed with real-time stdout/stderr streaming.

**Error Tracking**: Runtime errors are automatically captured and stored for debugging.

## Important Implementation Notes

- All sandbox operations are asynchronous and containerized
- Template downloads happen on-demand from the configured R2 bucket
- Instance metadata is stored as JSON files within the sandbox filesystem
- Port exposure creates publicly accessible URLs for development previews  
- GitHub operations require proper authentication tokens
- TypeScript strict mode is enabled - ensure all types are properly defined