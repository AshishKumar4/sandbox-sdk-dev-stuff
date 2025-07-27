FROM docker.io/cloudflare/sandbox:0.1.3

EXPOSE 3000 8080 3001 3002 3003 3004

# Run the same command as the original image
CMD ["bun", "index.ts"]