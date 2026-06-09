ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps

WORKDIR /app

COPY next-web/package.json next-web/package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY next-web/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
