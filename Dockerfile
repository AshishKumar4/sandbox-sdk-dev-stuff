# FROM docker.io/cloudflare/sandbox:0.1.3
FROM --platform=linux/arm64 docker.io/cloudflare/sandbox:0.1.3


# Create directory for error monitoring system
RUN mkdir -p /app/container /app/data

# Copy the process monitoring system
COPY container/ /app/container/

# Install dependencies for the monitoring system
WORKDIR /app/container
RUN bun install && bun run build

# Make scripts executable
RUN chmod +x /app/container/cli-tools.ts

# Create symlinks for easier CLI usage
RUN ln -sf /app/container/cli-tools.ts /usr/local/bin/monitor-cli

# Set proper permissions for data directory
RUN chmod 755 /app/data

# Reset workdir
WORKDIR /app

EXPOSE 3000

# Run the same command as the original image
CMD ["bun", "index.ts"]