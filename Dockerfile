# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files and static assets
COPY --from=builder /app/dist ./dist
COPY index.html ./
COPY serve.js ./
COPY dev.js ./
COPY bin ./bin

# Expose the port the app runs on
EXPOSE 8000

# Start the application
CMD ["npm", "run", "serve"]