FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy app source code, excluding files mentioned in .dockerignore (best practice)
COPY . .

# Expose backend port
EXPOSE 3005

# Start the application using standard node instead of watch
CMD ["node", "index.js"]
