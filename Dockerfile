# Build de produção para a VPS (Easypanel). Usa a saída "standalone" do Next.js.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Belem \
    ANEXOS_DIR=/app/anexos_storage
RUN apk add --no-cache tzdata \
  && addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/anexos_storage && chown app:app /app/anexos_storage
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# Anexos persistem em volume montado em /app/anexos_storage
VOLUME ["/app/anexos_storage"]
CMD ["node", "server.js"]
