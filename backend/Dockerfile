FROM node:24-alpine AS builder
WORKDIR /app
COPY .npmrc package*.json ./
RUN npm install --loglevel=silent
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=3072" npm run build

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY .npmrc package*.json ./
RUN npm install --omit=dev --loglevel=silent
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
