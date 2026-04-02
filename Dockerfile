# Stage 1: Build client
FROM node:22-alpine AS client-builder
RUN npm install -g pnpm
WORKDIR /app
COPY client/package.json ./client/
COPY pnpm-workspace.yaml package.json ./
RUN pnpm install --filter client
COPY client ./client
RUN pnpm --filter client build

# Stage 2: Build server
FROM node:22-alpine AS server-builder
RUN npm install -g pnpm
WORKDIR /app
COPY server/package.json ./server/
COPY pnpm-workspace.yaml package.json ./
RUN pnpm install --filter server
COPY server ./server
RUN pnpm --filter server build

# Stage 3: Production
FROM node:22-alpine AS production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=client-builder /app/client/dist ./client/dist
COPY server/package.json ./server/
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
