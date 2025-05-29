const crypto = require('crypto');
const logger = require('../utils/logger');

class CryptoService {
  constructor() {
    this.algorithms = {
      symmetric: 'aes-256-gcm',
      hash: 'sha256',
      keyDerivation: 'pbkdf2'
    };
  }

  // 生成 DEK (數據加密密鑰)
  generateDEK(keySize = 256) {
    try {
      const bytes = keySize / 8; // 轉換為字節
      const dek = crypto.randomBytes(bytes).toString('hex');
      
      logger.debug(`生成 DEK: ${keySize} bits`);
      return dek;
      
    } catch (error) {
      logger.error('生成 DEK 失敗:', error);
      throw error;
    }
  }

  // 使用 DEK 加密數據
  encryptData(data, dek) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithms.symmetric, Buffer.from(dek, 'hex'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithms.symmetric
      };
      
    } catch (error) {
      logger.error('加密數據失敗:', error);
      throw error;
    }
  }

  // 使用 DEK 解密數據
  decryptData(encryptedData, dek, iv, authTag) {
    try {
      const decipher = crypto.createDecipher(this.algorithms.symmetric, Buffer.from(dek, 'hex'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      logger.error('解密數據失敗:', error);
      throw error;
    }
  }

  // 生成隨機 IV
  generateIV() {
    return crypto.randomBytes(16).toString('hex');
  }

  // 計算數據哈希
  calculateHash(data) {
    return crypto.createHash(this.algorithms.hash).update(data).digest('hex');
  }

  // 驗證數據完整性
  verifyIntegrity(data, expectedHash) {
    const actualHash = this.calculateHash(data);
    return actualHash === expectedHash;
  }
}

module.exports = CryptoService;