FROM node:22-alpine

# Uses the version pinned by "packageManager" in package.json
RUN corepack enable

WORKDIR /app

# Install dependencies first so they are cached until a manifest changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps ./apps
COPY script ./script
COPY src ./src

EXPOSE 3001

# Skips future pnpm install calls that can run on start
ENV SKIP_INSTALL=1

# Runs the API and the web client
CMD ["./script/start"]
