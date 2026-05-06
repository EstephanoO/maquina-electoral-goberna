FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Sessions directory (mounted as volume)
RUN mkdir -p /app/sessions

EXPOSE 4020
CMD ["node", "dist/index.js"]
