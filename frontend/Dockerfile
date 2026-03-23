# Estágio 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Build vars expected
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY . .

RUN npm run build

# Estágio 2: Nginx para servir arquivos SPA
FROM nginx:alpine

# Remove pág inicial default do Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia os arquivos compilados do React
COPY --from=builder /app/dist /usr/share/nginx/html

# Configura as rotas para o SPA (Single Page Application)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
