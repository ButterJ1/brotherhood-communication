FROM node:18-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package 文件
COPY package*.json ./

# 安裝依賴 (使用 npm install 而非 npm ci)
RUN npm install --only=production

# 複製源碼
COPY . .

# 創建非 root 用戶
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 更改文件擁有者
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3001

# 健康檢查 (需要先安裝 curl)
# 在 alpine 中安裝 curl
USER root
RUN apk --no-cache add curl
USER nextjs

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# 啟動應用
CMD ["npm", "start"]