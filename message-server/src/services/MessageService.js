const { v4: uuidv4 } = require('uuid');

class MessageService {
  constructor() {
    this.messages = new Map(); // messageId -> message
    this.userMessages = new Map(); // userId -> [messageIds]
    this.offlineMessages = new Map(); // userId -> [encryptedMessages]
  }

  createMessage(messageData) {
    const message = {
      id: uuidv4(),
      senderId: messageData.senderId,
      senderUsername: messageData.senderUsername,
      recipientId: messageData.recipientId,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      encrypted: messageData.encrypted || false,
      timestamp: new Date(),
      status: 'sent'
    };

    // 儲存訊息
    this.messages.set(message.id, message);

    // 更新用戶訊息索引
    this.addToUserMessages(messageData.senderId, message.id);
    this.addToUserMessages(messageData.recipientId, message.id);

    return message;
  }

  createEncryptedMessage(messageData) {
    const encryptedMessage = {
      id: uuidv4(),
      senderId: messageData.senderId,
      senderUsername: messageData.senderUsername,
      recipientId: messageData.recipientId,
      encryptedContent: messageData.encryptedContent,
      messageType: messageData.messageType || 'encrypted',
      encrypted: true,
      timestamp: new Date(),
      status: 'sent',
      keyId: messageData.encryptedContent.keyId,
      algorithm: messageData.encryptedContent.algorithm
    };

    // 儲存加密訊息
    this.messages.set(encryptedMessage.id, encryptedMessage);

    // 更新用戶訊息索引
    this.addToUserMessages(messageData.senderId, encryptedMessage.id);
    this.addToUserMessages(messageData.recipientId, encryptedMessage.id);

    return encryptedMessage;
  }

  // 存儲離線訊息
  storeOfflineMessage(userId, message) {
    if (!this.offlineMessages.has(userId)) {
      this.offlineMessages.set(userId, []);
    }
    
    this.offlineMessages.get(userId).push(message);
    
    // 限制離線訊息數量
    const maxOfflineMessages = 100;
    const userMessages = this.offlineMessages.get(userId);
    if (userMessages.length > maxOfflineMessages) {
      userMessages.splice(0, userMessages.length - maxOfflineMessages);
    }
  }

  // 獲取離線訊息
  getOfflineMessages(userId) {
    const messages = this.offlineMessages.get(userId) || [];
    this.offlineMessages.delete(userId); // 清空已獲取的離線訊息
    return messages;
  }

  addToUserMessages(userId, messageId) {
    if (!this.userMessages.has(userId)) {
      this.userMessages.set(userId, []);
    }
    this.userMessages.get(userId).push(messageId);

    // 限制用戶訊息數量
    const maxMessages = 1000;
    const userMsgs = this.userMessages.get(userId);
    if (userMsgs.length > maxMessages) {
      userMsgs.splice(0, userMsgs.length - maxMessages);
    }
  }

  getUserMessages(userId, limit = 50) {
    const messageIds = this.userMessages.get(userId) || [];
    return messageIds
      .slice(-limit) // 取最近的訊息
      .map(id => this.messages.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  getMessage(messageId) {
    return this.messages.get(messageId);
  }

  updateMessageStatus(messageId, status) {
    const message = this.messages.get(messageId);
    if (message) {
      message.status = status;
      message.updatedAt = new Date();
    }
    return message;
  }

  getMessageCount() {
    return this.messages.size;
  }

  // 獲取加密訊息統計
  getEncryptionStats() {
    let encryptedCount = 0;
    let totalCount = 0;

    for (const message of this.messages.values()) {
      totalCount++;
      if (message.encrypted) {
        encryptedCount++;
      }
    }

    return {
      totalMessages: totalCount,
      encryptedMessages: encryptedCount,
      encryptionRate: totalCount > 0 ? (encryptedCount / totalCount * 100).toFixed(2) : 0
    };
  }
}

module.exports = MessageService;