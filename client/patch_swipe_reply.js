const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/app/chat/page.js');
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Add touchData ref near longPressTimerRef ──────────────────────────────
content = content.replace(
  '  const longPressTimerRef = useRef(null);',
  `  const longPressTimerRef = useRef(null);
  const touchData = useRef({ startX: 0, startY: 0, isHorizontal: null });`
);

// ─── 2. Replace touch handlers on message wrapper + add swipe-reply-icon + fix reactions ───
// Find the existing touch handlers block and the bubble+reactions block
// We'll replace the entire section from onTouchStart through the closing of reactions

const OLD_TOUCH_AND_BUBBLE = `                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setMsgActionSheet({ msg, isMe });
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
                      }}`;

const NEW_TOUCH = `                      onTouchStart={(e) => {
                        touchData.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, isHorizontal: null };
                        longPressTimerRef.current = setTimeout(() => {
                          setMsgActionSheet({ msg, isMe });
                        }, 500);
                      }}
                      onTouchMove={(e) => {
                        const deltaX = e.touches[0].clientX - touchData.current.startX;
                        const deltaY = e.touches[0].clientY - touchData.current.startY;
                        if (touchData.current.isHorizontal === null) {
                          touchData.current.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) + 5;
                        }
                        if (touchData.current.isHorizontal && deltaX > 0) {
                          if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                          const clampedX = Math.min(deltaX, 75);
                          const bubbleEl = e.currentTarget.querySelector('.swipe-bubble');
                          if (bubbleEl) bubbleEl.style.transform = \`translateX(\${clampedX}px)\`;
                          const iconEl = e.currentTarget.querySelector('.swipe-icon');
                          if (iconEl) { const p = Math.min(clampedX / 55, 1); iconEl.style.opacity = p.toString(); iconEl.style.transform = \`scale(\${p})\`; }
                        }
                      }}
                      onTouchEnd={(e) => {
                        const deltaX = e.changedTouches[0].clientX - touchData.current.startX;
                        const bubbleEl = e.currentTarget.querySelector('.swipe-bubble');
                        if (bubbleEl) { bubbleEl.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)'; bubbleEl.style.transform = 'translateX(0)'; setTimeout(() => { if (bubbleEl) bubbleEl.style.transition = ''; }, 300); }
                        const iconEl = e.currentTarget.querySelector('.swipe-icon');
                        if (iconEl) { iconEl.style.opacity = '0'; iconEl.style.transform = 'scale(0)'; }
                        if (touchData.current.isHorizontal && deltaX > 55) {
                          setReplyingTo({ id: msg.id, text: msg.text, senderId: msg.senderId, _selfId: currentUser?.id });
                        }
                        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                        touchData.current.isHorizontal = null;
                      }}`;

content = content.replace(OLD_TOUCH_AND_BUBBLE, NEW_TOUCH);

// ─── 3. Wrap bubble + reactions in a column wrapper, add swipe-icon + swipe-bubble class ───
const OLD_BUBBLE_AND_REACTIONS = `                      {/* Bubble */}
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
                      >`;

const NEW_BUBBLE_AND_REACTIONS = `                      {/* Swipe-to-reply indicator icon (appears on left during swipe) */}
                      <div className="swipe-icon" style={{ position: 'absolute', [isMe ? 'left' : 'right']: isMe ? '-32px' : '-32px', top: '50%', transform: 'translateY(-50%) scale(0)', opacity: 0, transition: 'none', width: '24px', height: '24px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      </div>

                      {/* Column wrapper: bubble on top, reactions below */}
                      <div className="swipe-bubble" style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
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
                      >`;

content = content.replace(OLD_BUBBLE_AND_REACTIONS, NEW_BUBBLE_AND_REACTIONS);

// ─── 4. Close the column wrapper after reactions ──────────────────────────────
const OLD_REACTIONS_END = `                      {/* Reactions */}
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
                    </div>`;

const NEW_REACTIONS_END = `                      {/* Reactions — below bubble */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '3px', marginBottom: '2px' }}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                            <button
                              key={emoji}
                              onClick={() => sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji)}
                              style={{ background: users.includes(currentUser?.id) ? 'rgba(99,102,241,0.15)' : 'var(--surface)', border: users.includes(currentUser?.id) ? '1.5px solid rgba(99,102,241,0.4)' : '1px solid var(--border-light)', borderRadius: '20px', padding: '2px 8px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                            >
                              {emoji}
                              {users.length > 1 && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{users.length}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      </div>{/* end swipe-bubble column */}
                    </div>`;

content = content.replace(OLD_REACTIONS_END, NEW_REACTIONS_END);

fs.writeFileSync(filePath, content);
console.log('✅ Swipe-to-reply + reactions fix patched');
