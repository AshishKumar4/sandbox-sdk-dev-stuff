# FROM docker.io/ghostwriternr/cloudflare-sandbox:0.1.0
# If building your project on arm64, use:
FROM docker.io/ghostwriternr/cloudflare-sandbox-arm:0.0.9

EXPOSE 3000

# Run the same command as the original image
CMD ["bun", "index.ts"]