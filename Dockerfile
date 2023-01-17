FROM node:16-alpine
ENV NODE_ENV=production

# Disable npm update message
RUN npm config set update-notifier false

# ====================================
# Install dependencies
# ====================================
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm -d ci

# Copy app files
COPY . ./

# Build routes
RUN npm run build:tsoa

ENV PORT 80
EXPOSE 80

CMD [ "npm", "run", "start" ]
