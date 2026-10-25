# syntax=docker/dockerfile:1.7

FROM node:24.22.1-alpine AS base

WORKDIR /app
RUN apk add --no-cache libc6-compat \
  && npm install -g pnpm@12.14.0

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./

# postinstall runs `nuxt prepare`, which needs the sources: scripts run in the build stage
RUN --mount=type=cache,target=/pnpm/store,id=pnpm-store-memory \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --ignore-scripts

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN --mount=type=cache,target=/pnpm/store,id=pnpm-store-memory \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

ARG APP_RELEASE=unknown
ENV APP_RELEASE=${APP_RELEASE}

ENV NODE_OPTIONS=--max-old-space-size=8192

RUN pnpm run build

FROM node:24.22.1-alpine AS runtime

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3500
ENV HOST=0.0.0.0
ENV PORT=3500

ARG APP_RELEASE=unknown
LABEL org.opencontainers.image.revision="${APP_RELEASE}"

RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

WORKDIR /app

COPY --from=build --chown=app:app /app/.output/ ./

USER app
EXPOSE 3500

CMD ["node", "/app/server/index.mjs"]
