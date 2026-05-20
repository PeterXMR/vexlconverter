FROM node:26-alpine AS builder
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# Note: master runs as root to bind port 80; workers drop to nginx user (default behaviour)
HEALTHCHECK CMD wget -q --spider http://localhost:80/ || exit 1
