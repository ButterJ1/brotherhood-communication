const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const ConnectionManager = require('./src/services/ConnectionManager');
const MessageService = require('./src/services/MessageService');
const logger = require('./src/utils/logger');

class MessageServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.connectionManager = new ConnectionManager(this.io);
    this.messageService = new MessageService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' })); // 增加限制以支持加密數據
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // 健康檢查
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connections: this.connectionManager.getConnectionCount(),
        service: 'message-server',
        version: '2.0.0',
        features: ['websocket', 'encryption', 'kacls-integration']
      });
    });

    // 取得線上用戶列表
    this.app.get('/api/users/online', (req, res) => {
      const onlineUsers = this.connectionManager.getOnlineUsers();
      res.json({ users: onlineUsers });
    });

    // 加密客戶端測試頁面
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'encrypted-client.html'));
    });

    // API 路由前綴
    const apiRouter = express.Router();

    // 訊息歷史（為未來功能預留）
    apiRouter.get('/messages/:userId', (req, res) => {
      const { userId } = req.params;
      const messages = this.messageService.getUserMessages(userId);
      res.json({ messages });
    });

    // 訊息統計
    apiRouter.get('/stats', (req, res) => {
      res.json({
        totalMessages: this.messageService.getMessageCount(),
        onlineUsers: this.connectionManager.getConnectionCount(),
        timestamp: new Date().toISOString()
      });
    });

    this.app.use('/api', apiRouter);
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`新連線建立: ${socket.id}`);

      // 用戶註冊
      socket.on('register', (userData) => {
        this.handleUserRegister(socket, userData);
      });

      // 發送普通訊息（向後兼容）
      socket.on('sendMessage', (messageData) => {
        this.handleSendMessage(socket, messageData);
      });

      // 發送加密訊息（新功能）
      socket.on('sendEncryptedMessage', (encryptedMessageData) => {
        this.handleSendEncryptedMessage(socket, encryptedMessageData);
      });

      // 加入房間（群組）
      socket.on('joinRoom', (roomData) => {
        this.handleJoinRoom(socket, roomData);
      });

      // 離開房間
      socket.on('leaveRoom', (roomData) => {
        this.handleLeaveRoom(socket, roomData);
      });

      // 斷線處理
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // 錯誤處理
      socket.on('error', (error) => {
        logger.error(`Socket 錯誤 ${socket.id}:`, error);
      });
    });
  }

  handleUserRegister(socket, userData) {
    try {
      const { username, userId } = userData;

      if (!username || !userId) {
        socket.emit('error', { message: '用戶名稱和ID為必填' });
        return;
      }

      // 註冊用戶連線
      const user = this.connectionManager.registerUser(socket, {
        userId,
        username,
        socketId: socket.id,
        connectedAt: new Date(),
        supportsEncryption: true // 標記支持加密
      });

      socket.userId = userId;
      socket.username = username;

      // 通知註冊成功
      socket.emit('registerSuccess', { user });

      // 廣播用戶上線
      socket.broadcast.emit('userOnline', { user });

      logger.info(`用戶註冊成功: ${username} (${userId}) - 支持加密`);
    } catch (error) {
      logger.error('用戶註冊失敗:', error);
      socket.emit('error', { message: '註冊失敗' });
    }
  }

  handleSendMessage(socket, messageData) {
    try {
      const { recipientId, content, messageType = 'text' } = messageData;
      const senderId = socket.userId;
      const senderUsername = socket.username;

      if (!senderId) {
        socket.emit('error', { message: '請先註冊' });
        return;
      }

      if (!recipientId || !content) {
        socket.emit('error', { message: '收件人和訊息內容為必填' });
        return;
      }

      // 創建普通訊息
      const message = this.messageService.createMessage({
        senderId,
        senderUsername,
        recipientId,
        content,
        messageType,
        encrypted: false
      });

      // 發送給收件人
      const recipientSocket = this.connectionManager.getUserSocket(recipientId);
      if (recipientSocket) {
        recipientSocket.emit('newMessage', message);

        // 確認訊息已送達
        socket.emit('messageDelivered', {
          messageId: message.id,
          deliveredAt: new Date()
        });

        logger.info(`普通訊息送達: ${senderId} -> ${recipientId}`);
      } else {
        // 收件人離線
        socket.emit('messagePending', {
          messageId: message.id,
          reason: 'recipient_offline'
        });

        logger.info(`訊息待送: ${senderId} -> ${recipientId} (收件人離線)`);
      }

    } catch (error) {
      logger.error('發送普通訊息失敗:', error);
      socket.emit('error', { message: '發送失敗' });
    }
  }

  handleSendEncryptedMessage(socket, encryptedMessageData) {
    try {
      const { recipientId, encryptedContent, messageType = 'encrypted' } = encryptedMessageData;
      const senderId = socket.userId;
      const senderUsername = socket.username;

      if (!senderId) {
        socket.emit('error', { message: '請先註冊' });
        return;
      }

      if (!recipientId || !encryptedContent) {
        socket.emit('error', { message: '收件人和加密內容為必填' });
        return;
      }

      // 驗證加密內容格式
      if (!this.validateEncryptedContent(encryptedContent)) {
        socket.emit('error', { message: '加密內容格式無效' });
        return;
      }

      // 創建加密訊息
      const encryptedMessage = this.messageService.createEncryptedMessage({
        senderId,
        senderUsername,
        recipientId,
        encryptedContent,
        messageType
      });

      // 發送給收件人
      const recipientSocket = this.connectionManager.getUserSocket(recipientId);
      if (recipientSocket) {
        recipientSocket.emit('encryptedMessage', encryptedMessage);

        // 確認訊息已送達
        socket.emit('messageDelivered', {
          messageId: encryptedMessage.id,
          deliveredAt: new Date(),
          encrypted: true
        });

        const algorithm = encryptedContent.algorithm || 'unknown';
        logger.info(`🔐 ${algorithm} 加密訊息送達: ${senderId} -> ${recipientId}`);
      } else {
        // 收件人離線，存儲加密訊息
        this.messageService.storeOfflineMessage(recipientId, encryptedMessage);

        socket.emit('messagePending', {
          messageId: encryptedMessage.id,
          reason: 'recipient_offline',
          encrypted: true
        });

        const algorithm = encryptedContent.algorithm || 'unknown';
        logger.info(`🔐 ${algorithm} 加密訊息待送: ${senderId} -> ${recipientId} (收件人離線)`);
      }

    } catch (error) {
      logger.error('發送加密訊息失敗:', error);
      socket.emit('error', { message: '發送加密訊息失敗' });
    }
  }

  // 驗證加密內容格式 - 支持 ECDH
  validateEncryptedContent(encryptedContent) {
    try {
      // 檢查基本結構
      if (!encryptedContent || typeof encryptedContent !== 'object') {
        logger.warn('加密內容不是有效對象');
        return false;
      }

      // 檢查算法類型
      const algorithm = encryptedContent.algorithm;

      if (algorithm === 'ECDH-AES-GCM') {
        // ECDH 格式驗證
        const requiredFields = ['encryptedData', 'iv', 'algorithm', 'timestamp'];

        for (const field of requiredFields) {
          if (!encryptedContent[field]) {
            logger.warn(`ECDH 加密內容缺少必要字段: ${field}`);
            return false;
          }
        }

        // 驗證數據格式
        if (typeof encryptedContent.encryptedData !== 'string' ||
          typeof encryptedContent.iv !== 'string') {
          logger.warn('ECDH 加密數據格式無效');
          return false;
        }

        logger.info('ECDH 加密內容驗證通過');
        return true;

      } else if (algorithm === 'AES-GCM') {
        // 舊的 DEK 格式驗證 (向後兼容)
        const requiredFields = ['encryptedData', 'iv', 'keyId', 'algorithm'];

        for (const field of requiredFields) {
          if (!encryptedContent[field]) {
            logger.warn(`DEK 加密內容缺少必要字段: ${field}`);
            return false;
          }
        }

        // 驗證算法
        const supportedAlgorithms = ['AES-GCM', 'aes-256-gcm'];
        if (!supportedAlgorithms.includes(encryptedContent.algorithm)) {
          logger.warn(`不支持的加密算法: ${encryptedContent.algorithm}`);
          return false;
        }

        logger.info('DEK 加密內容驗證通過');
        return true;

      } else {
        logger.warn(`未知的加密算法: ${algorithm}`);
        return false;
      }

    } catch (error) {
      logger.error('驗證加密內容時發生錯誤:', error);
      return false;
    }
  }

  handleJoinRoom(socket, roomData) {
    try {
      const { roomId } = roomData;
      socket.join(roomId);

      socket.emit('joinRoomSuccess', { roomId });
      socket.to(roomId).emit('userJoinedRoom', {
        userId: socket.userId,
        username: socket.username,
        roomId,
        supportsEncryption: true
      });

      logger.info(`用戶 ${socket.username} 加入房間 ${roomId}`);
    } catch (error) {
      logger.error('加入房間失敗:', error);
      socket.emit('error', { message: '加入房間失敗' });
    }
  }

  handleLeaveRoom(socket, roomData) {
    try {
      const { roomId } = roomData;
      socket.leave(roomId);

      socket.emit('leaveRoomSuccess', { roomId });
      socket.to(roomId).emit('userLeftRoom', {
        userId: socket.userId,
        username: socket.username,
        roomId
      });

      logger.info(`用戶 ${socket.username} 離開房間 ${roomId}`);
    } catch (error) {
      logger.error('離開房間失敗:', error);
      socket.emit('error', { message: '離開房間失敗' });
    }
  }

  handleDisconnect(socket) {
    try {
      const userId = socket.userId;
      const username = socket.username;

      if (userId) {
        // 移除用戶連線
        this.connectionManager.removeUser(socket.id);

        // 廣播用戶離線
        socket.broadcast.emit('userOffline', { userId, username });

        logger.info(`用戶離線: ${username} (${userId})`);
      }
    } catch (error) {
      logger.error('處理斷線失敗:', error);
    }
  }

  start(port = 3001) {
    this.server.listen(port, () => {
      logger.info(`🚀 Brotherhood Message Server (v2.0) 啟動成功！`);
      logger.info(`📡 服務位址: http://localhost:${port}`);
      logger.info(`🔧 測試頁面: http://localhost:${port}`);
      logger.info(`❤️  健康檢查: http://localhost:${port}/health`);
      logger.info(`🔐 功能特色: 端到端加密 + KACLS 整合`);
    });
  }
}

// 啟動服務
const messageServer = new MessageServer();
messageServer.start(process.env.PORT || 3001);

module.exports = MessageServer;