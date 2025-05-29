const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'brotherhood-secret-key';
    this.validUsers = new Set(); // 簡化版本，實際應該連接到用戶數據庫
    this.sessionStore = new Map(); // userId -> sessionData
  }

  // 驗證用戶（簡化版）
  validateUser(userId) {
    try {
      // 簡化版驗證，實際應該檢查用戶權限、狀態等
      if (!userId || typeof userId !== 'string') {
        return false;
      }
      
      // 檢查用戶是否在黑名單中
      if (this.isUserBlacklisted(userId)) {
        return false;
      }
      
      // 簡單驗證：所有非空字符串用戶都有效
      return userId.length > 0;
      
    } catch (error) {
      logger.error('用戶驗證失敗:', error);
      return false;
    }
  }

  // 生成訪問令牌
  generateAccessToken(userId, permissions = []) {
    try {
      const payload = {
        userId,
        permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1小時有效
      };
      
      return jwt.sign(payload, this.jwtSecret);
      
    } catch (error) {
      logger.error('生成訪問令牌失敗:', error);
      throw error;
    }
  }

  // 驗證訪問令牌
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
      
    } catch (error) {
      logger.error('驗證訪問令牌失敗:', error);
      return null;
    }
  }

  // 檢查權限
  checkPermission(userId, resource, action) {
    try {
      // 簡化版權限檢查
      const session = this.sessionStore.get(userId);
      
      if (!session) {
        return false;
      }
      
      // 檢查權限列表
      const permissions = session.permissions || [];
      const requiredPermission = `${resource}:${action}`;
      
      return permissions.includes(requiredPermission) || permissions.includes('*:*');
      
    } catch (error) {
      logger.error('權限檢查失敗:', error);
      return false;
    }
  }

  // 創建用戶會話
  createSession(userId, permissions = []) {
    try {
      const sessionId = crypto.randomUUID();
      const sessionData = {
        sessionId,
        userId,
        permissions,
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小時
      };
      
      this.sessionStore.set(userId, sessionData);
      
      logger.info(`用戶會話創建: ${userId}`);
      return sessionData;
      
    } catch (error) {
      logger.error('創建用戶會話失敗:', error);
      throw error;
    }
  }

  // 清理過期會話
  cleanupExpiredSessions() {
    const now = new Date();
    const expiredSessions = [];
    
    for (const [userId, session] of this.sessionStore.entries()) {
      if (now > new Date(session.expiresAt)) {
        expiredSessions.push(userId);
      }
    }
    
    expiredSessions.forEach(userId => {
      this.sessionStore.delete(userId);
      logger.info(`清理過期會話: ${userId}`);
    });
    
    return expiredSessions.length;
  }

  // 檢查用戶是否在黑名單中
  isUserBlacklisted(userId) {
    // 簡化版本，實際應該連接到黑名單數據庫
    const blacklist = ['banned_user', 'test_malicious'];
    return blacklist.includes(userId);
  }

  // 記錄安全事件
  logSecurityEvent(event, userId, details = {}) {
    logger.warn(`安全事件: ${event}`, {
      userId,
      timestamp: new Date().toISOString(),
      ...details
    });
  }
}

module.exports = AuthService;