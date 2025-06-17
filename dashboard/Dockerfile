FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Start the application
CMD ["npm", "start"]
