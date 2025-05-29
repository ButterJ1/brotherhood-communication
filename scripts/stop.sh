#!/bin/bash

echo "🛑 停止 Brotherhood 通訊系統..."

# 停止所有容器
docker-compose down

# 可選：清理未使用的資源
read -p "是否要清理未使用的 Docker 資源？ (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 清理未使用的資源..."
    docker system prune -f
    docker volume prune -f
fi

echo "✅ Brotherhood 通訊系統已停止"