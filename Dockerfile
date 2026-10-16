FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY content ./content
COPY public ./public
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY content ./content
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4317/healthz || exit 1
CMD ["node", "server/index.mjs", "--production"]
