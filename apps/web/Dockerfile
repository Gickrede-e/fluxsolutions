FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @fluxsolutions/shared
RUN npm run build --workspace @fluxsolutions/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@fluxsolutions/web"]
