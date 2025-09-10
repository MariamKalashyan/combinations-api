FROM node:18-alpine AS base

WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

FROM base AS builder
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm prune --production

FROM base AS release

ENV PATH /app/node_modules/.bin:$PATH
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "./dist/main.js"]