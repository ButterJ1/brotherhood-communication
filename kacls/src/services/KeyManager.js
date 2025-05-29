const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class KeyManager {
  constructor() {
    this.masterKey = null;
    this.keyStore = new Map(); // keyId -> keyData
    this.permissions = new Map(); // keyId -> permissions
    this.keyMetadata = new Map(); // keyId -> metadata
  }

  // 初始化主密鑰
  async initializeMasterKey() {
    try {
      // 在生產環境中，這應該從安全的密鑰存儲中獲取
      const masterKeyId = process.env.MASTER_KEY_ID || 'brotherhood-master-key';
      
      // 生成或加載主密鑰
      this.masterKey = crypto.randomBytes(32); // 256-bit 主密鑰
      
      logger.info('主密鑰初始化完成');
      return true;
    } catch (error) {
      logger.error('主密鑰初始化失敗:', error);
      throw error;
    }
  }

  // 包裝 DEK
  async wrapKey(dek, metadata) {
    try {
      const keyId = uuidv4();
      const timestamp = new Date();
      
      // 創建加密上下文
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
      cipher.setAAD(Buffer.from(keyId)); // 使用 keyId 作為附加認證數據
      
      // 加密 DEK
      let encrypted = cipher.update(dek, 'hex', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      // 存儲包裝後的密鑰
      const wrappedKeyData = {
        encryptedDek: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm'
      };
      
      // 存儲密鑰和元數據
      this.keyStore.set(keyId, wrappedKeyData);
      this.keyMetadata.set(keyId, {
        ...metadata,
        keyId,
        createdAt: timestamp,
        algorithm: 'aes-256-gcm'
      });
      
      // 存儲權限
      this.permissions.set(keyId, {
        userId: metadata.userId,
        resourceId: metadata.resourceId,
        permissions: metadata.permissions || ['read'],
        createdAt: timestamp,
        expiresAt: metadata.expiresAt
      });
      
      logger.info(`DEK 包裝完成: ${keyId}`);
      
      return {
        id: keyId,
        data: {
          keyId,
          encryptedDek: encrypted,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex')
        },
        metadata: this.keyMetadata.get(keyId)
      };
      
    } catch (error) {
      logger.error('包裝 DEK 失敗:', error);
      throw error;
    }
  }

  // 解包 DEK
  async unwrapKey(wrappedKeyData, keyId) {
    try {
      // 檢查密鑰是否存在
      if (!this.keyStore.has(keyId)) {
        throw new Error('Key not found');
      }
      
      const storedKey = this.keyStore.get(keyId);
      const metadata = this.keyMetadata.get(keyId);
      
      // 檢查密鑰是否過期
      if (metadata.expiresAt && new Date() > new Date(metadata.expiresAt)) {
        logger.warn(`密鑰已過期: ${keyId}`);
        this.keyStore.delete(keyId);
        this.keyMetadata.delete(keyId);
        this.permissions.delete(keyId);
        throw new Error('Key expired');
      }
      
      // 解密 DEK
      const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
      decipher.setAAD(Buffer.from(keyId));
      decipher.setAuthTag(Buffer.from(storedKey.authTag, 'hex'));
      
      let decrypted = decipher.update(storedKey.encryptedDek, 'hex', 'hex');
      decrypted += decipher.final('hex');
      
      logger.info(`DEK 解包完成: ${keyId}`);
      
      return {
        dek: decrypted,
        metadata: metadata
      };
      
    } catch (error) {
      logger.error('解包 DEK 失敗:', error);
      throw error;
    }
  }

  // 檢查權限
  async checkPermission(keyId, userId, resourceId) {
    try {
      const permission = this.permissions.get(keyId);
      
      if (!permission) {
        return false;
      }
      
      // 檢查用戶權限
      if (permission.userId !== userId) {
        return false;
      }
      
      // 檢查資源權限
      if (resourceId && permission.resourceId !== resourceId) {
        return false;
      }
      
      // 檢查過期時間
      if (permission.expiresAt && new Date() > new Date(permission.expiresAt)) {
        return false;
      }
      
      return true;
      
    } catch (error) {
      logger.error('檢查權限失敗:', error);
      return false;
    }
  }

  // 密鑰輪換
  async rotateKey(oldKeyId, newMetadata) {
    try {
      // 檢查舊密鑰
      if (!this.keyStore.has(oldKeyId)) {
        throw new Error('Old key not found');
      }
      
      // 生成新的 DEK
      const newDek = crypto.randomBytes(32).toString('hex');
      
      // 包裝新密鑰
      const wrappedNewKey = await this.wrapKey(newDek, {
        ...newMetadata,
        rotatedFrom: oldKeyId,
        rotatedAt: new Date()
      });
      
      // 標記舊密鑰為已輪換（保留一段時間以支持解密舊數據）
      const oldMetadata = this.keyMetadata.get(oldKeyId);
      if (oldMetadata) {
        oldMetadata.rotatedTo = wrappedNewKey.id;
        oldMetadata.rotatedAt = new Date();
        oldMetadata.status = 'rotated';
      }
      
      logger.info(`密鑰輪換完成: ${oldKeyId} -> ${wrappedNewKey.id}`);
      
      return {
        newDek: newDek,
        newWrappedKey: wrappedNewKey.data,
        newKeyId: wrappedNewKey.id,
        rotatedAt: new Date()
      };
      
    } catch (error) {
      logger.error('密鑰輪換失敗:', error);
      throw error;
    }
  }

  // 獲取公鑰（用於客戶端驗證）
  async getPublicKey() {
    // 簡化版本，實際應該使用 RSA 密鑰對
    return {
      algorithm: 'RSA-OAEP',
      keySize: 2048,
      publicKey: 'mock-public-key-for-development'
    };
  }

  // 清理過期密鑰
  async cleanupExpiredKeys() {
    const now = new Date();
    const expiredKeys = [];
    
    for (const [keyId, metadata] of this.keyMetadata.entries()) {
      if (metadata.expiresAt && now > new Date(metadata.expiresAt)) {
        expiredKeys.push(keyId);
      }
    }
    
    expiredKeys.forEach(keyId => {
      this.keyStore.delete(keyId);
      this.keyMetadata.delete(keyId);
      this.permissions.delete(keyId);
      logger.info(`清理過期密鑰: ${keyId}`);
    });
    
    return expiredKeys.length;
  }
}

module.exports = KeyManager;