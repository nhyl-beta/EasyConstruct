FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci
COPY . .
RUN npm run build:server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=build /workspace/node_modules /app/node_modules
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/drizzle ./drizzle
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 8000
# No curl in alpine, so probe with node. PORT is set by the host (Render); it defaults to 8000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/src/main.js"]
