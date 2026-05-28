const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/app/chat/page.js');
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Import sendReaction from useSocket ────────────────────────────────────
content = content.replace(
  'sendMessage,\n    deleteMessage,\n    emitTyping,',
  'sendMessage,\n    deleteMessage,\n    sendReaction,\n    emitTyping,'
);

// ─── 2. Add replyingTo + hoveredMsgId states near bannerUploading ─────────────
content = content.replace(
  '  const [editingSocialLinks, setEditingSocialLinks] = useState(false);',
  `  const [editingSocialLinks, setEditingSocialLinks] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);`
);

// ─── 3. Update onSendMessage to pass replyingTo ───────────────────────────────
content = content.replace(
  `    const result = await sendMessage(
      activeFriend.id,
      text.trim(),
      pendingMedia?.url || null,
      pendingMedia?.type || null
    );`,
  `    const result = await sendMessage(
      activeFriend.id,
      text.trim(),
      pendingMedia?.url || null,
      pendingMedia?.type || null,
      replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId } : null
    );`
);

// ─── 4. Clear replyingTo on success ─────────────────────────────────────────
content = content.replace(
  `    if (!result) {
      setSendError('Failed to save message. IndexedDB may be full.');
      setTimeout(() => setSendError(''), 4000);
      return false;
    }

    setPendingMedia(null);
    emitTyping(activeFriend.id, false);
    return true;`,
  `    if (!result) {
      setSendError('Failed to save message. IndexedDB may be full.');
      setTimeout(() => setSendError(''), 4000);
      return false;
    }

    setPendingMedia(null);
    setReplyingTo(null);
    emitTyping(activeFriend.id, false);
    return true;`
);

// ─── 5. Update MessageInputBar component to accept + show reply bar ───────────
content = content.replace(
  'const MessageInputBar = React.memo(({ onSendMessage, pendingMedia, uploading, fileInputRef, triggerFileSelector, handleFileUpload, emitTyping, activeFriendId }) => {',
  'const MessageInputBar = React.memo(({ onSendMessage, pendingMedia, uploading, fileInputRef, triggerFileSelector, handleFileUpload, emitTyping, activeFriendId, replyingTo, onCancelReply }) => {'
);

// Replace the return of MessageInputBar to include reply bar
content = content.replace(
  `  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-4">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,application/*" />`,
  `  return (
    <div className="w-full">
      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '0 0 6px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)', borderLeft: '3px solid var(--primary)' }}>
          <Reply style={{ width: '13px', height: '13px', color: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              {replyingTo.senderId === replyingTo._selfId ? 'Replying to yourself' : 'Replying'}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-subtle)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingTo.text || '📎 Attachment'}
            </p>
          </div>
          <button type="button" onClick={onCancelReply} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-subtle)', flexShrink: 0 }}>
            <X style={{ width: '13px', height: '13px' }} />
          </button>
        </div>
      )}
    <form onSubmit={handleSubmit} className="flex items-center gap-4">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,application/*" />`
);

// Close the wrapper div
content = content.replace(
  `    </form>
  );
});
MessageInputBar.displayName = 'MessageInputBar';`,
  `    </form>
    </div>
  );
});
MessageInputBar.displayName = 'MessageInputBar';`
);

// ─── 6. Pass replyingTo props to MessageInputBar usage ───────────────────────
content = content.replace(
  'emitTyping={emitTyping}\n                        activeFriendId={activeFriend.id}',
  `emitTyping={emitTyping}\n                        activeFriendId={activeFriend.id}\n                        replyingTo={replyingTo}\n                        onCancelReply={() => setReplyingTo(null)}`
);

// ─── 7. Rewrite message render section with reply/react/emoji ─────────────────
const OLD_MSG_OUTER = `                   onContextMenu={(e) => {
                        e.preventDefault();
                        setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                      }}
                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                        }, 600);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onTouchMove={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                    >
                      {/* Bubble */}
                      <div
                        className={isMe ? 'bubble-out' : 'bubble-in'}
                        style={{
                          position: 'relative',
                          maxWidth: '100%',
                          fontSize: '14px',
                          lineHeight: '1.4',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                        }}
                      >
                        {/* Text only — with extra right/bottom padding for timestamp */}
                        {msg.text && !msg.mediaUrl && (
                          <div style={{
                            padding: '7px 10px',
                            paddingBottom: '22px',
                            paddingRight: isMe ? '68px' : '52px',
                          }}>
                            {msg.text}
                            <TsRow />
                          </div>
                        )}`;

const NEW_MSG_OUTER = `                   onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { setHoveredMsgId(null); if (emojiPickerMsgId === msg.id) setEmojiPickerMsgId(null); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                      }}
                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setEmojiPickerMsgId(msg.id);
                        }, 500);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onTouchMove={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                    >
                      {/* Hover action row */}
                      {hoveredMsgId === msg.id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                          {/* Reply btn */}
                          <button
                            onClick={() => setReplyingTo({ id: msg.id, text: msg.text, senderId: msg.senderId, _selfId: currentUser?.id })}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--text-muted)' }}
                            title="Reply"
                          >
                            <Reply style={{ width: '11px', height: '11px' }} /> Reply
                          </button>
                          {/* Emoji trigger */}
                          <button
                            onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id)}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '3px 7px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}
                            title="React"
                          >😊</button>
                          {/* Delete (own msgs only) */}
                          {isMe && (
                            <button
                              onClick={() => setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId })}
                              style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '10px', color: '#ef4444' }}
                              title="Delete"
                            >
                              <Trash2 style={{ width: '11px', height: '11px' }} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Emoji picker popup */}
                      {emojiPickerMsgId === msg.id && (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', justifyContent: isMe ? 'flex-end' : 'flex-start', background: 'var(--surface)', borderRadius: '20px', padding: '4px 8px', border: '1px solid var(--border-light)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 'fit-content', marginLeft: isMe ? 'auto' : 0 }}>
                          {['❤️','😂','😮','😢','😡','👍','🔥','🎉'].map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => {
                                sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji);
                                setEmojiPickerMsgId(null);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px', borderRadius: '6px', transition: 'transform 0.1s' }}
                              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >{emoji}</button>
                          ))}
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={isMe ? 'bubble-out' : 'bubble-in'}
                        style={{
                          position: 'relative',
                          maxWidth: '100%',
                          fontSize: '14px',
                          lineHeight: '1.4',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                        }}
                      >
                        {/* Reply quote block */}
                        {msg.replyTo && (
                          <div style={{ margin: '6px 8px 2px', padding: '5px 8px', borderRadius: '8px', borderLeft: '3px solid rgba(255,255,255,0.5)', background: isMe ? 'rgba(0,0,0,0.15)' : 'var(--border-light)', opacity: 0.9 }}>
                            <p style={{ fontSize: '10px', fontWeight: 700, margin: '0 0 1px', opacity: 0.8, color: isMe ? '#fff' : 'var(--primary)' }}>
                              {msg.replyTo.senderId === currentUser?.id ? 'You' : activeFriend?.username}
                            </p>
                            <p style={{ fontSize: '11px', margin: 0, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', color: isMe ? '#fff' : 'var(--text)' }}>
                              {msg.replyTo.text || '📎 Attachment'}
                            </p>
                          </div>
                        )}

                        {/* Text only — with extra right/bottom padding for timestamp */}
                        {msg.text && !msg.mediaUrl && (
                          <div style={{
                            padding: '7px 10px',
                            paddingBottom: '22px',
                            paddingRight: isMe ? '68px' : '52px',
                          }}>
                            {msg.text}
                            <TsRow />
                          </div>
                        )}`;

content = content.replace(OLD_MSG_OUTER, NEW_MSG_OUTER);

// ─── 8. Add reactions display after the closing </div> of bubble ──────────────
content = content.replace(
  `                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />`,
  `                      </div>
                      {/* Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                            <button
                              key={emoji}
                              onClick={() => sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji)}
                              style={{ background: users.includes(currentUser?.id) ? 'rgba(99,102,241,0.15)' : 'var(--surface)', border: users.includes(currentUser?.id) ? '1.5px solid rgba(99,102,241,0.4)' : '1px solid var(--border-light)', borderRadius: '20px', padding: '2px 7px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              {emoji}
                              {users.length > 1 && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{users.length}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />`
);

fs.writeFileSync(filePath, content);
console.log('✅ Reply + Reactions patched into page.js');
