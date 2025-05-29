class ConnectionManager {
  constructor(io) {
    this.io = io;
    this.connections = new Map(); // socketId -> userInfo
    this.userSockets = new Map();  // userId -> socket實例
  }

  registerUser(socket, userInfo) {
    // 如果用戶已經有連線，先清除舊連線
    if (this.userSockets.has(userInfo.userId)) {
      const oldSocket = this.userSockets.get(userInfo.userId);
      this.connections.delete(oldSocket.id);
      // 斷開舊連線
      if (oldSocket.connected) {
        oldSocket.emit('error', { message: '您的帳號在其他地方登入' });
        oldSocket.disconnect();
      }
    }

    this.connections.set(socket.id, userInfo);
    this.userSockets.set(userInfo.userId, socket);

    return userInfo;
  }

  removeUser(socketId) {
    const userInfo = this.connections.get(socketId);
    if (userInfo) {
      this.connections.delete(socketId);
      this.userSockets.delete(userInfo.userId);
    }
    return userInfo;
  }

  getUserSocket(userId) {
    const socket = this.userSockets.get(userId);
    // 檢查 socket 是否仍然連線
    if (socket && socket.connected) {
      return socket;
    } else if (socket && !socket.connected) {
      // 清理斷線的 socket
      this.userSockets.delete(userId);
      this.connections.delete(socket.id);
    }
    return null;
  }

  getOnlineUsers() {
    // 清理斷線的用戶
    this.cleanupDisconnectedUsers();
    
    return Array.from(this.userSockets.entries())
      .filter(([userId, socket]) => socket.connected)
      .map(([userId, socket]) => {
        const userInfo = this.connections.get(socket.id);
        return {
          userId: userInfo.userId,
          username: userInfo.username,
          connectedAt: userInfo.connectedAt,
          supportsEncryption: userInfo.supportsEncryption || false
        };
      });
  }

  getConnectionCount() {
    this.cleanupDisconnectedUsers();
    return this.connections.size;
  }

  isUserOnline(userId) {
    const socket = this.userSockets.get(userId);
    return socket && socket.connected;
  }

  // 清理斷線的用戶
  cleanupDisconnectedUsers() {
    const disconnectedUsers = [];
    
    for (const [userId, socket] of this.userSockets.entries()) {
      if (!socket.connected) {
        disconnectedUsers.push({ userId, socketId: socket.id });
      }
    }
    
    disconnectedUsers.forEach(({ userId, socketId }) => {
      this.userSockets.delete(userId);
      this.connections.delete(socketId);
    });
  }
}

module.exports = ConnectionManager;