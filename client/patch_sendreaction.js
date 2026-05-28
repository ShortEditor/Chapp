const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/context/SocketContext.js');
let content = fs.readFileSync(filePath, 'utf8');

const sendReactionFn = `  // SEND REACTION — toggle emoji on a message, relay to the other user
  const sendReaction = useCallback(async (messageId, recipientId, emoji) => {
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
    if (!currentUser.id || !messageId || !emoji) return;
    try {
      const msg = await db.messages.get(messageId);
      if (msg) {
        const reactions = { ...(msg.reactions || {}) };
        const users = reactions[emoji] ? [...reactions[emoji]] : [];
        if (users.includes(currentUser.id)) {
          reactions[emoji] = users.filter(u => u !== currentUser.id);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, currentUser.id];
        }
        await db.messages.update(messageId, { reactions });
      }
    } catch (err) { console.error('Reaction local update error:', err); }
    const activeSocket = socketRef.current;
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('send-reaction', { messageId, recipientId, emoji });
    }
  }, []);

`;

// Find the return statement after deleteMessage
const returnIdx = content.lastIndexOf('\n  return (\n    <SocketContext.Provider');
if (returnIdx === -1) { console.error('Return not found'); process.exit(1); }
content = content.slice(0, returnIdx) + '\n\n' + sendReactionFn + content.slice(returnIdx + 1);
fs.writeFileSync(filePath, content);
console.log('✅ sendReaction inserted');
