# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for DocuMind.
#
#   docker build -t documind .
#   docker run --rm -p 3000:3000 --env-file .env documind
#
# The final image uses Next.js "standalone" output: a minimal server bundle
# with only the node_modules files that are actually traced at build time.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ── Stage 2: build the application ───────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma Client (needs the schema, not a live database),
# then produce the standalone production bundle.
RUN npx prisma generate && npm run build

# ── Stage 3: slim runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Non-root user for a smaller attack surface.
USER node

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Safety net: make sure the generated Prisma engine files are present even if
# build-time file tracing missed them.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]
