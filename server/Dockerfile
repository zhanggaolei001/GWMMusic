FROM node:20-alpine AS build
WORKDIR /app

# Copy upstream dependencies (the server depends on the local vendor module)
COPY vendor ./vendor

# Use faster registry mirror to reduce network timeouts during install
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# Install vendor dependencies so package's own deps (e.g. xml2js) exist
WORKDIR /app/vendor
RUN npm ci --prefer-offline --no-audit --progress=false || true

# Install server dependencies (copy only package files to leverage cache)
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --prefer-offline --no-audit --progress=false

# Copy full server sources and build
COPY server ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
# Copy built assets and dependencies
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/vendor /vendor

# Ensure the local vendor module resolves correctly from node_modules
RUN rm -rf ./node_modules/netease-cloud-music-api-alger || true \
    && mkdir -p ./node_modules \
    && ln -s /app/vendor ./node_modules/netease-cloud-music-api-alger

COPY server/.env.example ./server/.env.example

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
