FROM node:20-slim

WORKDIR /app

# Install dependencies first
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Skip Next.js build - this is a BACKEND ONLY service
# Next.js will be built and hosted on Vercel

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

# Run the server directly
CMD ["node", "server.js"]