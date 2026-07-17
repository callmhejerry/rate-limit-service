FROM node:22-alpine AS base

WORKDIR /app

# Copy package files and local node_modules from host
COPY package*.json ./
COPY node_modules ./node_modules

# Build stage: Build the NestJS application
FROM base AS build

COPY . .

RUN npm run build

# Final stage: Run the application
FROM node:22-alpine AS production

WORKDIR /app

# Copy built app and node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3000

ENV PORT=3000

CMD ["node", "dist/main.js"]
