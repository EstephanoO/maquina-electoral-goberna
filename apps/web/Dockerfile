# Frontend Next.js 16 — production image.
# Multi-stage: deps → build → runtime para mantener la imagen liviana.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# wget for healthcheck (alpine)
RUN apk add --no-cache wget && \
    addgroup -S -g 1001 nextjs && \
    adduser -S -u 1001 -G nextjs nextjs

COPY --from=deps    --chown=nextjs:nextjs /app/node_modules     ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/.next            ./.next
COPY --from=builder --chown=nextjs:nextjs /app/public           ./public
COPY --from=builder --chown=nextjs:nextjs /app/package.json     ./package.json
COPY --from=builder --chown=nextjs:nextjs /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts   ./next.config.ts

USER nextjs
EXPOSE 3001

CMD ["npm", "start", "--", "-p", "3001"]
