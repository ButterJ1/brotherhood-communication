#!/bin/bash

backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $backup_dir

echo "💾 Brotherhood 系統備份..."
echo "備份目錄: $backup_dir"

# 備份 KACLS 數據
echo "備份 KACLS 數據..."
docker-compose exec -T kacls tar czf - /app/data 2>/dev/null > $backup_dir/kacls_data.tar.gz

# 備份配置文件
echo "備份配置文件..."
cp -r nginx $backup_dir/
cp docker-compose.yml $backup_dir/
cp .env* $backup_dir/ 2>/dev/null || true

# 備份日誌
echo "備份日誌..."
docker-compose logs > $backup_dir/service_logs.txt 2>&1

# 創建備份信息文件
cat > $backup_dir/backup_info.txt << EOF
Brotherhood 通訊系統備份
備份時間: $(date)
服務狀態:
$(docker-compose ps)

系統版本:
$(docker --version)
$(docker-compose --version)
EOF

echo "✅ 備份完成: $backup_dir"