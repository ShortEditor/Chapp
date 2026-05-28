const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/app/chat/page.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add msgActionSheet state
content = content.replace(
  '  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);',
  `  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
  const [msgActionSheet, setMsgActionSheet] = useState(null); // { msg, isMe }`
);

// 2. Change long-press to open action sheet instead of emoji picker
content = content.replace(
  `                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setEmojiPickerMsgId(msg.id);
                        }, 500);
                      }}`,
  `                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setMsgActionSheet({ msg, isMe });
                        }, 500);
                      }}`
);

// 3. Add mobile action sheet modal just before the closing of the chat area (before deleteTarget modal)
const SHEET_ANCHOR = `            {/* Delete Message Confirmation Modal */}`;
const SHEET_INSERT = `            {/* Mobile Message Action Sheet */}
            {msgActionSheet && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
                  onClick={() => setMsgActionSheet(null)}
                />
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                  background: 'var(--surface)',
                  borderRadius: '24px 24px 0 0',
                  padding: '12px 0 32px',
                  boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
                  animation: 'slideUp 0.2s ease-out',
                }}>
                  {/* Drag handle */}
                  <div style={{ width: '36px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 16px' }} />

                  {/* Message preview */}
                  <div style={{ padding: '0 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-subtle)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {msgActionSheet.msg.text || '📎 Attachment'}
                    </p>
                  </div>

                  {/* Emoji strip */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '14px 20px', borderBottom: '1px solid var(--border-light)' }}>
                    {['❤️','😂','😮','😢','😡','👍','🔥','🎉'].map(emoji => {
                      const msg = msgActionSheet.msg;
                      const isMe = msgActionSheet.isMe;
                      const reacted = msg.reactions?.[emoji]?.includes(currentUser?.id);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji);
                            setMsgActionSheet(null);
                          }}
                          style={{
                            background: reacted ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)',
                            border: reacted ? '2px solid rgba(99,102,241,0.4)' : '1.5px solid var(--border-light)',
                            borderRadius: '50%', width: '44px', height: '44px',
                            cursor: 'pointer', fontSize: '22px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >{emoji}</button>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '8px 0' }}>
                    <button
                      onClick={() => {
                        setReplyingTo({ id: msgActionSheet.msg.id, text: msgActionSheet.msg.text, senderId: msgActionSheet.msg.senderId, _selfId: currentUser?.id });
                        setMsgActionSheet(null);
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '15px', fontFamily: 'var(--font-jakarta)', fontWeight: 500 }}
                    >
                      <Reply style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
                      Reply
                    </button>
                    {msgActionSheet.isMe && (
                      <button
                        onClick={() => {
                          setDeleteTarget({ id: msgActionSheet.msg.id, senderId: msgActionSheet.msg.senderId, receiverId: msgActionSheet.msg.receiverId });
                          setMsgActionSheet(null);
                        }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '15px', fontFamily: 'var(--font-jakarta)', fontWeight: 500 }}
                      >
                        <Trash2 style={{ width: '18px', height: '18px' }} />
                        Delete message
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Delete Message Confirmation Modal */}`;

content = content.replace(SHEET_ANCHOR, SHEET_INSERT);

fs.writeFileSync(filePath, content);
console.log('✅ Mobile action sheet patched');
