FROM oven/bun:1.2.10-alpine

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3001

CMD ["bun", "run", "start"]
