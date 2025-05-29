.PHONY: start stop logs test dev backup restore clean help

help:
	@echo "Brotherhood 通訊系統 - 可用命令:"
	@echo "  make start   - 啟動生產環境"
	@echo "  make dev     - 啟動開發環境"  
	@echo "  make stop    - 停止所有服務"
	@echo "  make logs    - 查看日誌"
	@echo "  make test    - 執行測試"
	@echo "  make backup  - 創建備份"
	@echo "  make clean   - 清理系統"

start:
	@./scripts/start.sh

dev:
	@./scripts/dev.sh

stop:
	@./scripts/stop.sh

logs:
	@./scripts/logs.sh

test:
	@./scripts/test.sh

backup:
	@./scripts/backup.sh

clean:
	@echo "🧹 清理 Brotherhood 系統..."
	@docker-compose down -v
	@docker system prune -f
	@docker volume prune -f
	@echo "✅ 清理完成"