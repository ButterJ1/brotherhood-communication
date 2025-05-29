#!/bin/bash

echo "🧪 Brotherhood 通訊系統測試"

# 等待服務啟動
echo "⏳ 等待服務就緒..."
sleep 5

# 測試函數
test_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo "測試 $service_name..."
    
    response=$(curl -s -o /dev/null -w "%{http_code}" $url)
    
    if [ "$response" -eq "$expected_status" ]; then
        echo "✅ $service_name 測試通過 ($response)"
        return 0
    else
        echo "❌ $service_name 測試失敗 (期望: $expected_status, 實際: $response)"
        return 1
    fi
}

# 執行測試
failed_tests=0

test_service "Nginx" "http://localhost/health" || ((failed_tests++))
test_service "Message Server" "http://localhost:3001/health" || ((failed_tests++))
test_service "KACLS" "http://localhost:3002/health" || ((failed_tests++))

# 測試 API 端點
test_service "Message Server API" "http://localhost/api/message/users/online" || ((failed_tests++))
test_service "KACLS API" "http://localhost/api/kacls/public-key" || ((failed_tests++))

# 測試 WebSocket 連線（簡單檢查）
echo "測試 WebSocket 支援..."
if curl -s -H "Upgrade: websocket" -H "Connection: Upgrade" http://localhost/socket.io/ > /dev/null; then
    echo "✅ WebSocket 測試通過"
else
    echo "❌ WebSocket 測試失敗"
    ((failed_tests++))
fi

# 總結
echo ""
if [ $failed_tests -eq 0 ]; then
    echo "🎉 所有測試通過！系統運行正常"
    exit 0
else
    echo "❌ $failed_tests 個測試失敗"
    exit 1
fi