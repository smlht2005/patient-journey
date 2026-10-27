# patient-journey (Next.js 14, output: 'standalone')。放進該 repo 根目錄並命名為 Dockerfile。
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* 在 build 時就被寫進前端程式碼,所以換網域要重建映像
ARG NEXT_PUBLIC_BASE_URL=http://localhost:8080
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
# build 只需要能通過的假值(與 repo 的 ci.yml 相同);真值在執行時才注入,不會進映像
RUN SESSION_SECRET=build_only_placeholder_000000000000000 ANTHROPIC_API_KEY=placeholder \
    SMART_CLIENT_ID=placeholder FHIR_ISS=https://example.invalid/fhir \
    SMART_REDIRECT_URI=http://localhost:8080/api/auth/callback SMART_SCOPES=openid \
    ALLOWED_EHR_ORIGINS="*" npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]
