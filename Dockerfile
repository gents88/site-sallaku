FROM node:22-alpine AS builder
WORKDIR /app
COPY portfolio-backend/package*.json ./
RUN npm install
COPY portfolio-backend/ .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY portfolio-backend/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
