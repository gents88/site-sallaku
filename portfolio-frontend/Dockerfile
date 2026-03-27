FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build:prod

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist/portfolio-frontend ./dist/portfolio-frontend
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production
CMD ["node", "dist/portfolio-frontend/server/server.mjs"]
