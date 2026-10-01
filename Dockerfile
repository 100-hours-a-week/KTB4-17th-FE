# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci

# 소스 복사 및 빌드
COPY . .
RUN npm run build


# Runtime Stage
FROM nginx:1.27-alpine

# FE 정적 파일만 이미지에 포함
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80