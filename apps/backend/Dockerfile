FROM oven/bun:1.2.10-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3001

CMD ["bun", "run", "start"]
