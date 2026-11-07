FROM node:24-alpine

WORKDIR /app
RUN corepack enable
COPY . .
RUN corepack prepare pnpm@12.18.0 --activate && pnpm install --frozen-lockfile

ENV NODE_ENV=development
