#!/bin/bash

echo "🔧 Brotherhood 通訊系統 - 開發模式啟動"

# 檢查是否存在 .env.dev 文件
if [ ! -f ".env.dev" ]; then
    echo "創建開發環境配置文件..."
    cat > .env.dev << EOF
NODE_ENV=development
MESSAGE_SERVER_PORT=3001
KACLS_PORT=3002
NGINX_PORT=80
JWT_SECRET=development-secret-key
MASTER_KEY_ID=brotherhood-dev-master-key
LOG_LEVEL=debug
EOF
fi

# 使用開發配置啟動
echo "🚀 使用開發配置啟動..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up --build
