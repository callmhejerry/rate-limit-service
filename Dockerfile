# Base stage: Install all dependencies (production + development)
FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./

RUN npm ci

# Build stage: Build the NestJS application
FROM base AS build

COPY . .

RUN npm run build

# Production dependencies stage: Prune non-production dependencies
FROM base AS production-deps

RUN npm prune --production

# Final stage: Run the application
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3000

ENV PORT=3000

CMD ["node", "dist/main.js"]
