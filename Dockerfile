# One container for the Render web service (TSK-0003; ARCH-STACK): the Fastify server serves the API, the health
# checks and the built public site. Adapted from Bh3os/handyhub-app. No secret is baked in: every value comes from the
# Render environment at run time.
FROM node:24-slim
WORKDIR /srv/app
ENV ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    SITE_DIR=/srv/app/apps/site/dist
EXPOSE 3000
# Apply pending migrations (idempotent; a drifted migration refuses to start), then serve.
CMD ["sh", "-c", "node packages/db/dist/cli/migrate.js && exec node apps/server/dist/main.js"]
