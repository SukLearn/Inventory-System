FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN mkdir -p /app/uploads/products
EXPOSE 4000
CMD ["node", "dist/server.js"]
