#!/bin/bash

if [ $# -eq 0 ]; then
    echo "使用方法: $0 <backup_directory>"
    echo "可用備份:"
    ls -la backups/ 2>/dev/null || echo "沒有找到備份目錄"
    exit 1
fi

backup_dir=$1

if [ ! -d "$backup_dir" ]; then
    echo "❌ 備份目錄不存在: $backup_dir"
    exit 1
fi

echo "🔄 從備份恢復系統: $backup_dir"

# 停止當前服務
echo "停止當前服務..."
docker-compose down

# 恢復配置文件
echo "恢復配置文件..."
if [ -d "$backup_dir/nginx" ]; then
    cp -r $backup_dir/nginx .
fi

if [ -f "$backup_dir/docker-compose.yml" ]; then
    cp $backup_dir/docker-compose.yml .
fi

# 恢復環境文件
cp $backup_dir/.env* . 2>/dev/null || true

# 恢復 KACLS 數據
if [ -f "$backup_dir/kacls_data.tar.gz" ]; then
    echo "恢復 KACLS 數據..."
    # 先啟動服務以創建容器
    docker-compose up -d kacls
    sleep 5
    
    # 恢復數據
    docker-compose exec -T kacls tar xzf - -C / < $backup_dir/kacls_data.tar.gz
    
    # 重啟服務
    docker-compose restart kacls
fi

echo "✅ 恢復完成"
echo "💡 請執行 ./scripts/start.sh 重新啟動完整系統"