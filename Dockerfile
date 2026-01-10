FROM node:20-alpine

WORKDIR /app

# Copy root and workspace manifests (Necessary?)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Copy source
COPY apps ./apps
COPY script ./script

EXPOSE 3001

# Builds and runs the applications
CMD ["./script/start"]
