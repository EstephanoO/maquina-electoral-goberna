FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY tsconfig.json ./

# tsx is a devDep; install it too (tiny, keeps dev/prod parity)
RUN npm install tsx --no-save

RUN mkdir -p /app/uploads
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
