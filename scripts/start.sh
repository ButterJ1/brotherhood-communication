#!/bin/bash

echo "🚀 Brotherhood 通訊系統 - 第二階段啟動中..."

# 檢查 Docker 是否安裝
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安裝，請先安裝 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安裝，請先安裝 Docker Compose"
    exit 1
fi

# 創建必要的目錄
mkdir -p nginx/conf.d
mkdir -p nginx/ssl
mkdir -p logs

# 檢查配置文件
if [ ! -f "nginx/nginx.conf" ]; then
    echo "❌ nginx/nginx.conf 文件不存在"
    exit 1
fi

if [ ! -f "nginx/conf.d/brotherhood.conf" ]; then
    echo "❌ nginx/conf.d/brotherhood.conf 文件不存在"
    exit 1
fi

# 停止現有容器
echo "🛑 停止現有容器..."
docker-compose down

# 構建和啟動服務
echo "🏗️  構建服務..."
docker-compose build

echo "🚀 啟動服務..."
docker-compose up -d

# 等待服務啟動
echo "⏳ 等待服務啟動..."
sleep 10

# 檢查服務狀態
echo "🔍 檢查服務狀態..."
docker-compose ps

# 健康檢查
echo "❤️  執行健康檢查..."
echo "檢查 Nginx..."
curl -f http://localhost/health || echo "❌ Nginx 健康檢查失敗"

echo "檢查 Message Server..."
curl -f http://localhost:3001/health || echo "❌ Message Server 健康檢查失敗"

echo "檢查 KACLS..."
curl -f http://localhost:3002/health || echo "❌ KACLS 健康檢查失敗"

echo ""
echo "🎉 Brotherhood 通訊系統啟動完成！"
echo ""
echo "📡 服務地址："
echo "   - 主頁面: http://localhost"
echo "   - Message Server: http://localhost:3001"
echo "   - KACLS: http://localhost:3002"
echo ""
echo "📝 查看日誌："
echo "   docker-compose logs -f [service_name]"
echo ""
echo "🛑 停止服務："
echo "   ./scripts/stop.sh"