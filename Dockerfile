# Use an official, lightweight base image containing both Python 3.12 and Node.js 20
FROM nikolaik/python-nodejs:python3.12-nodejs20-slim

# Set working directory
WORKDIR /app

# Copy package configurations and install Node.js dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy Python requirements and install Python dependencies
COPY server/requirements.txt ./server/
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy the rest of the application files
COPY . .

# Expose port (Cloud Run will inject PORT environment variable, which server.js respects)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Run the concurrent launcher to boot both servers
CMD ["npm", "start"]
