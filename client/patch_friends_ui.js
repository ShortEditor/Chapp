const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/app/chat/page.js');
let content = fs.readFileSync(filePath, 'utf8');

const START = '{/* ── FRIENDS TAB ── */}';
const END = '{/* ── PROFILE TAB ── */}';

const startIdx = content.indexOf(START);
const endIdx = content.indexOf(END);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find markers'); process.exit(1);
}

const newSection = `{/* ── FRIENDS TAB ── */}
          {activeTab === 'friends' && (
            <div className="pb-6" style={{ background: 'var(--bg)' }}>

              {/* Search bar */}
              <div style={{ padding: '12px 14px 0' }}>
                <form onSubmit={handleAddFriend} className="flex gap-2 relative">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search username to add..."
                      value={newFriendUsername}
                      onChange={e => setNewFriendUsername(e.target.value)}
                      className="msg-field w-full"
                      style={{ borderRadius: '14px', padding: '10px 14px 10px 38px', fontSize: '13px', height: '42px' }}
                    />
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <Users style={{ width: '14px', height: '14px', color: 'var(--text-subtle)' }} />
                    </div>
                    {searchLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-subtle)' }} />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="px-4 rounded-2xl text-white font-bold text-xs shrink-0 flex items-center gap-1.5 justify-center transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'var(--primary)', height: '42px', border: 'none', cursor: 'pointer' }}
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>

                  {/* Suggestions Dropdown */}
                  {searchSuggestions.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setSearchSuggestions([])} />
                      <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl shadow-xl border overflow-hidden z-50 animate-zoom-in"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="max-h-60 overflow-y-auto">
                          {searchSuggestions.map(user => {
                            const isAdding = sendingRequestIds.has(user.id);
                            return (
                              <div key={user.id} className="flex items-center justify-between p-3 transition-colors"
                                style={{ borderBottom: '1px solid var(--border-light)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div className="flex items-center gap-3 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(user)}>
                                  <div className="avatar w-9 h-9 text-xs relative font-bold" style={{ background: getAvatarColor(user.username) }}>
                                    {user.username.slice(0, 2)}
                                    {user.avatar?.startsWith('http') && (
                                      <img src={optimizeAvatarUrl(user.avatar)} alt={user.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{renderUsername(user.username)}</p>
                                    <p className="text-[10px]" style={{ color: user.status === 'online' ? '#34a853' : 'var(--text-subtle)' }}>{user.status || 'offline'}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setSendingRequestIds(prev => { const n = new Set(prev); n.add(user.id); return n; });
                                    const token = localStorage.getItem('chapp_token');
                                    try {
                                      const response = await fetch(\`\${BACKEND_URL}/api/friends/request\`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
                                        body: JSON.stringify({ username: user.username })
                                      });
                                      const data = await response.json();
                                      if (!response.ok) throw new Error(data.error || 'Failed');
                                      setFriendRequestMessage({ text: data.message || 'Request sent!', type: 'success' });
                                      confetti({ particleCount: 40, spread: 20, origin: { y: 0.8 } });
                                      setSearchSuggestions(prev => prev.filter(item => item.id !== user.id));
                                      setNewFriendUsername('');
                                      refreshFriendsAndRequests(token);
                                    } catch (err) {
                                      setFriendRequestMessage({ text: err.message, type: 'error' });
                                    } finally {
                                      setSendingRequestIds(prev => { const n = new Set(prev); n.delete(user.id); return n; });
                                    }
                                  }}
                                  disabled={isAdding}
                                  style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                                >
                                  {isAdding ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </form>

                {/* Status message */}
                {friendRequestMessage.text && (
                  <div className="mt-2 px-3 py-2 rounded-xl text-xs animate-fade-in flex items-center gap-2" style={{
                    background: friendRequestMessage.type === 'success' ? 'rgba(52,168,83,0.10)' : 'rgba(239,68,68,0.08)',
                    color: friendRequestMessage.type === 'success' ? '#137333' : '#c5221f',
                    border: \`1px solid \${friendRequestMessage.type === 'success' ? 'rgba(52,168,83,0.25)' : 'rgba(239,68,68,0.2)'}\`,
                  }}>
                    {friendRequestMessage.type === 'success' ? <Check className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                    {friendRequestMessage.text}
                  </div>
                )}
              </div>

              {/* Friends List */}
              <div style={{ padding: '16px 14px 0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Friends</h3>
                  {dbFriends.length > 0 && (
                    <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '20px', padding: '1px 8px' }}>
                      {dbFriends.length}
                    </span>
                  )}
                </div>

                {dbFriends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div style={{ width: '52px', height: '52px', borderRadius: '18px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                      <Users style={{ width: '22px', height: '22px', color: 'var(--primary)' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>No friends yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Search a username above to connect</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dbFriends.map(friend => {
                      const isOnline = onlineFriends.get(friend.id) === 'online';
                      return (
                        <div
                          key={friend.id}
                          className="animate-fade-in"
                          style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                        >
                          <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(friend)}>
                            <div className="avatar" style={{ width: '44px', height: '44px', fontSize: '14px', background: getAvatarColor(friend.username), borderRadius: '50%', position: 'relative' }}>
                              {friend.username.slice(0, 2)}
                              {friend.avatar?.startsWith('http') && (
                                <img src={optimizeAvatarUrl(friend.avatar)} alt={friend.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} />
                              )}
                            </div>
                            {isOnline && <span className="status-dot status-online" style={{ borderColor: 'var(--surface)' }} />}
                          </div>
                          <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(friend)}>
                            <p className="font-bold truncate flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>
                              {renderUsername(friend.username)}
                            </p>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isOnline ? '#34a853' : 'var(--text-subtle)' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#34a853' : 'var(--border)', display: 'inline-block' }} />
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setActiveFriend(friend);
                              db.chats.put({ friendId: friend.id, lastMessageText: '', lastMessageTime: Date.now(), unreadCount: 0 }).catch(() => {});
                              setActiveTab('chats');
                            }}
                            style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '12px', background: 'var(--primary-light)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-container)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                            title="Open chat"
                          >
                            <MessageSquare style={{ width: '15px', height: '15px', color: 'var(--primary)' }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mutual Suggestions */}
              {mutualSuggestions.length > 0 && (
                <div style={{ padding: '20px 14px 0' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Mutual Connections</h3>
                  </div>
                  <div className="space-y-2">
                    {mutualSuggestions.map(s => (
                      <div key={s.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(s.username), borderRadius: '50%', position: 'relative' }}>
                            {s.username.slice(0, 2)}
                            {s.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(s.avatar)} alt={s.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(s.username)}</p>
                          <p style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600, margin: '2px 0 0' }}>{s.mutualFriends.length} mutual friend{s.mutualFriends.length > 1 ? 's' : ''}</p>
                        </div>
                        <button onClick={() => handleAddSuggestedFriend(s.username)} disabled={sendingRequestIds.has(s.id)}
                          style={{ flexShrink: 0, background: 'var(--primary-light)', border: '1.5px solid var(--primary-container)', borderRadius: '12px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {sendingRequestIds.has(s.id) ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discover People */}
              {otherSuggestions.length > 0 && (
                <div style={{ padding: '20px 14px 0' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Discover People</h3>
                    {fetchingSuggestions && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: 'var(--text-subtle)' }} />}
                  </div>
                  <div className="space-y-2">
                    {otherSuggestions.map(s => (
                      <div key={s.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(s.username), borderRadius: '50%', position: 'relative' }}>
                            {s.username.slice(0, 2)}
                            {s.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(s.avatar)} alt={s.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(s.username)}</p>
                          <p style={{ fontSize: '10px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>New to Chapp</p>
                        </div>
                        <button onClick={() => handleAddSuggestedFriend(s.username)} disabled={sendingRequestIds.has(s.id)}
                          style={{ flexShrink: 0, background: 'var(--primary-light)', border: '1.5px solid var(--primary-container)', borderRadius: '12px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {sendingRequestIds.has(s.id) ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── REQUESTS TAB ── */}
          {activeTab === 'requests' && (() => {
            const incoming = pendingRequests.filter(r => !r.isOutgoing);
            const outgoing = pendingRequests.filter(r => r.isOutgoing);
            return (
              <div className="pb-6" style={{ background: 'var(--bg)' }}>
                {pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div style={{ width: '56px', height: '56px', borderRadius: '20px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                      <BellRing style={{ width: '24px', height: '24px', color: 'var(--primary)' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>No pending requests</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Friend requests will appear here</p>
                  </div>
                ) : (
                  <>
                    {incoming.length > 0 && (
                      <div style={{ padding: '16px 14px 0' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Incoming</h3>
                          <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '20px', padding: '1px 8px' }}>{incoming.length}</span>
                        </div>
                        <div className="space-y-3">
                          {incoming.map(req => {
                            const u = req.friend;
                            return (
                              <div key={req.id} style={{ background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border-light)', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                                <div className="flex items-center gap-3 mb-3" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <div className="avatar" style={{ width: '46px', height: '46px', fontSize: '14px', background: getAvatarColor(u.username), borderRadius: '50%', position: 'relative' }}>
                                      {u.username.slice(0, 2)}
                                      {u.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                                    </div>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(u.username)}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>Wants to connect with you</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleRespondRequest(req.id, 'REJECT')}
                                    style={{ flex: 1, padding: '10px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >Decline</button>
                                  <button onClick={() => handleRespondRequest(req.id, 'ACCEPT')}
                                    style={{ flex: 1, padding: '10px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-jakarta)', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                  >Accept ✓</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {outgoing.length > 0 && (
                      <div style={{ padding: '20px 14px 0' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Sent</h3>
                          <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '20px', padding: '1px 8px' }}>{outgoing.length}</span>
                        </div>
                        <div className="space-y-2">
                          {outgoing.map(req => {
                            const u = req.friend;
                            return (
                              <div key={req.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(u.username), borderRadius: '50%', position: 'relative' }}>
                                    {u.username.slice(0, 2)}
                                    {u.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(u.username)}</p>
                                  <p style={{ fontSize: '10px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>Request pending...</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '20px', padding: '4px 10px', flexShrink: 0 }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b' }}>Pending</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          `;

content = content.slice(0, startIdx) + newSection + content.slice(endIdx);
fs.writeFileSync(filePath, content);
console.log('✅ Friends & Requests UI patched successfully');
