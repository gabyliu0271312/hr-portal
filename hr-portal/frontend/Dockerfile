# ========== Build stage ==========
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
# 没有 lock 时退化为 npm install；CI 中会生成 lock 后改为 npm ci
RUN npm install

COPY . .
RUN npm run build

# ========== Runtime stage ==========
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]