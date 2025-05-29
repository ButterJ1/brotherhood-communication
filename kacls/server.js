const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const KeyManager = require('./src/services/KeyManager');
const CryptoService = require('./src/services/CryptoService');
const AuthService = require('./src/services/AuthService');
const logger = require('./src/utils/logger');

class KACLSServer {
  constructor() {
    this.app = express();
    this.keyManager = new KeyManager();
    this.cryptoService = new CryptoService();
    this.authService = new AuthService();
    this.publicKeys = new Map(); // 存儲用戶公鑰 userId -> publicKeyInfo
    
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeMasterKey();
  }

  setupMiddleware() {
    // 安全中間件 (放寬限制用於開發)
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS 設置
    this.app.use(cors({
      origin: '*',
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // 請求日誌
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // 根路徑處理
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Brotherhood KACLS',
        version: '2.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: ['ECDH Key Exchange', 'Public Key Management', 'Legacy DEK Support'],
        endpoints: {
          health: '/health',
          // 新的 ECDH 端點
          registerPublicKey: '/api/register-public-key',
          getPublicKey: '/api/get-public-key/:userId',
          listPublicKeys: '/api/list-public-keys',
          // 舊的 DEK 端點 (向後兼容)
          generateKey: '/api/generate-key',
          wrapKey: '/api/wrap-key',
          unwrapKey: '/api/unwrap-key',
          publicKey: '/api/public-key'
        }
      });
    });

    // 健康檢查
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'KACLS',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        masterKeyInitialized: !!this.keyManager.masterKey,
        registeredPublicKeys: this.publicKeys.size
      });
    });

    // API 路由前綴
    const apiRouter = express.Router();
    
    // === 新的 ECDH 相關端點 ===
    apiRouter.post('/register-public-key', this.handleRegisterPublicKey.bind(this));
    apiRouter.get('/get-public-key/:userId', this.handleGetPublicKey.bind(this));
    apiRouter.get('/list-public-keys', this.handleListPublicKeys.bind(this));
    
    // === 舊的 DEK 相關端點 (向後兼容) ===
    apiRouter.post('/wrap-key', this.handleWrapKey.bind(this));
    apiRouter.post('/unwrap-key', this.handleUnwrapKey.bind(this));
    apiRouter.post('/generate-key', this.handleGenerateKey.bind(this));
    apiRouter.post('/rotate-key', this.handleRotateKey.bind(this));
    apiRouter.get('/public-key', this.handleGetPublicKey.bind(this));

    this.app.use('/api', apiRouter);
    
    // 404 處理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: [
          '/',
          '/health',
          '/api/register-public-key',
          '/api/get-public-key/:userId',
          '/api/list-public-keys',
          '/api/generate-key',
          '/api/public-key'
        ]
      });
    });
    
    // 錯誤處理
    this.app.use(this.errorHandler.bind(this));
  }

  async initializeMasterKey() {
    try {
      await this.keyManager.initializeMasterKey();
      logger.info('Master Key 初始化完成');
    } catch (error) {
      logger.error('Master Key 初始化失敗:', error);
    }
  }

  // === 新的 ECDH 相關方法 ===

  // 註冊公鑰
  async handleRegisterPublicKey(req, res) {
    try {
      const { userId, publicKey, algorithm } = req.body;
      
      if (!userId || !publicKey || !algorithm) {
        return res.status(400).json({
          error: 'Missing required fields: userId, publicKey, algorithm'
        });
      }

      // 驗證算法
      if (algorithm !== 'ECDH-P256') {
        return res.status(400).json({
          error: 'Unsupported algorithm. Only ECDH-P256 is supported.'
        });
      }

      // 驗證用戶
      if (!this.authService.validateUser(userId)) {
        return res.status(403).json({ error: 'Unauthorized user' });
      }

      // 存儲公鑰
      const keyInfo = {
        userId,
        publicKey,
        algorithm,
        keyId: uuidv4(),
        registeredAt: new Date(),
        lastUsed: new Date()
      };

      this.publicKeys.set(userId, keyInfo);

      logger.info(`公鑰註冊成功: ${userId} (${algorithm})`);
      
      res.json({
        success: true,
        keyId: keyInfo.keyId,
        message: 'Public key registered successfully'
      });

    } catch (error) {
      logger.error('註冊公鑰失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // 獲取公鑰
  async handleGetPublicKey(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          error: 'Missing userId parameter'
        });
      }

      // 檢查公鑰是否存在
      const keyInfo = this.publicKeys.get(userId);
      if (!keyInfo) {
        return res.status(404).json({
          error: 'Public key not found for this user',
          userId: userId
        });
      }

      // 更新最後使用時間
      keyInfo.lastUsed = new Date();

      logger.info(`公鑰獲取: ${userId}`);
      
      res.json({
        userId: keyInfo.userId,
        publicKey: keyInfo.publicKey,
        algorithm: keyInfo.algorithm,
        keyId: keyInfo.keyId,
        registeredAt: keyInfo.registeredAt
      });

    } catch (error) {
      logger.error('獲取公鑰失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // 列出所有公鑰
  async handleListPublicKeys(req, res) {
    try {
      const publicKeysList = Array.from(this.publicKeys.values()).map(keyInfo => ({
        userId: keyInfo.userId,
        algorithm: keyInfo.algorithm,
        keyId: keyInfo.keyId,
        registeredAt: keyInfo.registeredAt,
        lastUsed: keyInfo.lastUsed,
        publicKeyPreview: keyInfo.publicKey.substring(0, 20) + '...'
      }));

      res.json({
        count: publicKeysList.length,
        publicKeys: publicKeysList
      });

    } catch (error) {
      logger.error('列出公鑰失敗:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // === 舊的 DEK 相關方法 (向後兼容) ===

  async handleWrapKey(req, res) {
    try {
      const { dek, userId, resourceId, permissions } = req.body;
      
      if (!dek || !userId || !resourceId) {
        return res.status(400).json({
          error: 'Missing required fields: dek, userId, resourceId'
        });
      }

      if (!this.authService.validateUser(userId)) {
        return res.status(403).json({ error: 'Unauthorized user' });
      }

      const wrappedKey = await this.keyManager.wrapKey(dek, {
        userId,
        resourceId,
        permissions: permissions || ['read', 'write'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      logger.info(`DEK 包裝成功: ${userId} -> ${resourceId}`);
      
      res.json({
        wrappedKey: wrappedKey.data,
        keyId: wrappedKey.id,
        expiresAt: wrappedKey.metadata.expiresAt
      });

    } catch (error) {
      logger.error('包裝 DEK 失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  async handleUnwrapKey(req, res) {
    try {
      const { wrappedKey, keyId, userId, resourceId } = req.body;
      
      if (!wrappedKey || !keyId || !userId) {
        return res.status(400).json({
          error: 'Missing required fields: wrappedKey, keyId, userId'
        });
      }

      if (!this.authService.validateUser(userId)) {
        return res.status(403).json({ error: 'Unauthorized user' });
      }

      const hasPermission = await this.keyManager.checkPermission(keyId, userId, resourceId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const unwrappedKey = await this.keyManager.unwrapKey(wrappedKey, keyId);
      
      if (!unwrappedKey) {
        return res.status(404).json({ error: 'Key not found or expired' });
      }

      logger.info(`DEK 解包成功: ${userId} -> ${resourceId}`);
      
      res.json({
        dek: unwrappedKey.dek,
        permissions: unwrappedKey.metadata.permissions,
        expiresAt: unwrappedKey.metadata.expiresAt
      });

    } catch (error) {
      logger.error('解包 DEK 失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  async handleGenerateKey(req, res) {
    try {
      const { userId, resourceId, keySize = 256 } = req.body;
      
      if (!userId || !resourceId) {
        return res.status(400).json({
          error: 'Missing required fields: userId, resourceId'
        });
      }

      if (!this.authService.validateUser(userId)) {
        return res.status(403).json({ error: 'Unauthorized user' });
      }

      const newKey = await this.cryptoService.generateDEK(keySize);
      
      const wrappedKey = await this.keyManager.wrapKey(newKey, {
        userId,
        resourceId,
        permissions: ['read', 'write'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      logger.info(`新 DEK 生成並包裝: ${userId} -> ${resourceId}`);
      
      res.json({
        dek: newKey,
        wrappedKey: wrappedKey.data,
        keyId: wrappedKey.id,
        expiresAt: wrappedKey.metadata.expiresAt
      });

    } catch (error) {
      logger.error('生成 DEK 失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  async handleRotateKey(req, res) {
    try {
      const { oldKeyId, userId, resourceId } = req.body;
      
      if (!oldKeyId || !userId || !resourceId) {
        return res.status(400).json({
          error: 'Missing required fields: oldKeyId, userId, resourceId'
        });
      }

      if (!this.authService.validateUser(userId)) {
        return res.status(403).json({ error: 'Unauthorized user' });
      }

      const rotationResult = await this.keyManager.rotateKey(oldKeyId, {
        userId,
        resourceId
      });

      logger.info(`密鑰輪換完成: ${oldKeyId} -> ${rotationResult.newKeyId}`);
      
      res.json({
        newDek: rotationResult.newDek,
        newWrappedKey: rotationResult.newWrappedKey,
        newKeyId: rotationResult.newKeyId,
        oldKeyId: oldKeyId,
        rotatedAt: rotationResult.rotatedAt
      });

    } catch (error) {
      logger.error('密鑰輪換失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  async handleGetLegacyPublicKey(req, res) {
    try {
      const publicKey = await this.keyManager.getPublicKey();
      
      res.json({
        publicKey: publicKey,
        algorithm: 'RSA-OAEP',
        keySize: 2048
      });

    } catch (error) {
      logger.error('獲取舊版公鑰失敗:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }

  // 錯誤處理中間件
  errorHandler(err, req, res, next) {
    logger.error('Unhandled error:', err);
    
    res.status(err.status || 500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }

  start(port = 3002) {
    this.server = this.app.listen(port, '0.0.0.0', () => {
      logger.info(`🔐 Brotherhood KACLS v2.0 啟動成功！`);
      logger.info(`📡 服務位址: http://localhost:${port}`);
      logger.info(`🔑 支援功能: ECDH密鑰交換 + 傳統DEK管理`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        logger.info('KACLS 服務已停止');
      });
    }
  }
}

// 啟動服務
if (require.main === module) {
  const kacls = new KACLSServer();
  kacls.start(process.env.PORT || 3002);
  
  process.on('SIGTERM', () => {
    logger.info('收到 SIGTERM 信號，正在關閉服務...');
    kacls.stop();
  });
  
  process.on('SIGINT', () => {
    logger.info('收到 SIGINT 信號，正在關閉服務...');
    kacls.stop();
  });
}

module.exports = KACLSServer;