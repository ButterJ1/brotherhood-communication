# 🔐 Brotherhood 通訊系統 - 第二階段

端到端加密通訊系統，具備 KACLS 密鑰管理和 Nginx 負載均衡。

## 🚀 快速開始

```bash
# 啟動系統
./scripts/start.sh

# 或使用 Make
make start
```

## 🌐 訪問地址

- 主應用: http://localhost
- Message Server: http://localhost:3001  
- KACLS: http://localhost:3002

## 🛠️ 管理命令

```bash
make start    # 啟動系統
make stop     # 停止系統
make logs     # 查看日誌
make test     # 執行測試
make backup   # 創建備份
make clean    # 清理系統
```

## 📋 系統架構

```
客戶端(加密) ↔ Nginx ↔ { Message Server + KACLS }
```

## 🔒 安全特性

- ✅ 端到端加密 (AES-256-GCM)
- ✅ KACLS 密鑰管理
- ✅ 客戶端加密/解密
- ✅ 密鑰輪換機制
- ✅ Nginx 安全代理

---

**Brotherhood Communication System v2.0**