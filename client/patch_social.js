const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/app/chat/page.js');
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. ADD STATE after bannerUploading state ───────────────────────────────
const STATE_ANCHOR = "  const [bannerUploading, setBannerUploading] = useState(false);";
const STATE_INSERT = `  const [bannerUploading, setBannerUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState({});
  const [editingSocialLinks, setEditingSocialLinks] = useState(false);
  const [draftSocialLinks, setDraftSocialLinks] = useState({});`;
content = content.replace(STATE_ANCHOR, STATE_INSERT);

// ─── 2. LOAD socialLinks when currentUser is set ─────────────────────────────
// Find where currentUser is set from API (setCurrentUser(data))
const LOAD_ANCHOR = `      setCurrentUser(data);`;
const LOAD_INSERT = `      setCurrentUser(data);
      setSocialLinks(data.socialLinks || {});`;
// Only replace the first occurrence (in fetchCurrentUser)
const firstIdx = content.indexOf(LOAD_ANCHOR);
if (firstIdx !== -1) {
  content = content.slice(0, firstIdx) + LOAD_INSERT + content.slice(firstIdx + LOAD_ANCHOR.length);
}

// ─── 3. SAVE HANDLER (saveSocialLinks) ───────────────────────────────────────
const SAVE_ANCHOR = `  const handleBannerUpload = async (e) => {`;
const SAVE_INSERT = `  const saveSocialLinks = async (links) => {
    const token = localStorage.getItem('chapp_token');
    try {
      const res = await fetch(\`\${BACKEND_URL}/api/users/profile\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
        body: JSON.stringify({ socialLinks: links })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setCurrentUser(data);
      setSocialLinks(data.socialLinks || {});
    } catch (err) {
      console.error('Social links save error:', err.message);
    }
  };

  const handleBannerUpload = async (e) => {`;
content = content.replace(SAVE_ANCHOR, SAVE_INSERT);

// ─── 4. INSERT SOCIAL LINKS CARD before Sign Out section ─────────────────────
const SIGNOUT_ANCHOR = `              {/* ── Sign Out ── */}`;
const SOCIAL_CARD = `              {/* ── Social Links Card ── */}
              <div style={{ padding: '0 14px', marginBottom: '10px' }}>
                <div style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-jakarta)' }}>Social Links</span>
                    </div>
                    {!editingSocialLinks ? (
                      <button onClick={() => { setDraftSocialLinks({...socialLinks}); setEditingSocialLinks(true); }}
                        style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}>
                        {Object.values(socialLinks).some(v => v) ? 'Edit' : '+ Add'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setEditingSocialLinks(false)}
                          style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--border-light)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={async () => { await saveSocialLinks(draftSocialLinks); setEditingSocialLinks(false); }}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'var(--primary)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}>Save</button>
                      </div>
                    )}
                  </div>

                  {/* Display icons when not editing */}
                  {!editingSocialLinks && (() => {
                    const PLATFORMS = [
                      { key: 'instagram', label: 'Instagram', color: '#E1306C', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
                      { key: 'facebook', label: 'Facebook', color: '#1877F2', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> },
                      { key: 'youtube', label: 'YouTube', color: '#FF0000', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon fill="currentColor" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg> },
                      { key: 'twitter', label: 'X / Twitter', color: '#000', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                      { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg> },
                      { key: 'github', label: 'GitHub', color: '#333', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg> },
                      { key: 'tiktok', label: 'TikTok', color: '#010101', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.28 8.28 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z"/></svg> },
                      { key: 'snapchat', label: 'Snapchat', color: '#FFFC00', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.166 3C8.97 3 7 5.17 7 7.94v.91c-.34.13-.72.24-1.03.24a1 1 0 0 0-.97 1c0 .55.45 1 1 1h.08c-.2.42-.34.88-.34 1.38 0 1.66 1.32 3.03 3.01 3.15-.24.46-.66.77-1.12.77-.54 0-1.02-.33-1.4-.66-.25-.21-.54-.34-.86-.34-.87 0-1.57.53-1.79 1.26 1.37.27 2.44 1.07 3 2.08.28.5.72.83 1.2.83.24 0 .47-.08.68-.23.57-.41 1.2-.62 1.88-.62h.32c.68 0 1.31.21 1.88.62.21.15.44.23.68.23.48 0 .92-.33 1.2-.83.56-1.01 1.63-1.81 3-2.08-.22-.73-.92-1.26-1.79-1.26-.32 0-.61.13-.86.34-.38.33-.86.66-1.4.66-.46 0-.88-.31-1.12-.77 1.69-.12 3.01-1.49 3.01-3.15 0-.5-.14-.96-.34-1.38h.08c.55 0 1-.45 1-1a1 1 0 0 0-.97-1c-.31 0-.69-.11-1.03-.24V7.94C17 5.17 15.36 3 12.166 3z"/></svg> },
                      { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
                      { key: 'phone', label: 'Phone', color: '#34a853', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.61-.61a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
                    ];
                    const filled = PLATFORMS.filter(p => socialLinks[p.key]?.trim());
                    if (filled.length === 0) return (
                      <p style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '4px 16px 14px', margin: 0 }}>No social links added yet</p>
                    );
                    return (
                      <div style={{ padding: '4px 16px 14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {filled.map(p => (
                          <a key={p.key} href={socialLinks[p.key].startsWith('http') ? socialLinks[p.key] : (p.key === 'phone' ? \`tel:\${socialLinks[p.key]}\` : \`https://\${socialLinks[p.key]}\`)}
                            target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: p.key === 'snapchat' ? '#333' : \`\${p.color}15\`, border: \`1.5px solid \${p.color}30\`, borderRadius: '12px', padding: '5px 10px', textDecoration: 'none', color: p.color === '#000' || p.color === '#010101' ? 'var(--text)' : p.color }}
                            title={p.label}
                          >
                            {p.icon}
                            <span style={{ fontSize: '11px', fontWeight: 700, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                          </a>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Edit form */}
                  {editingSocialLinks && (() => {
                    const PLATFORMS = [
                      { key: 'instagram', label: 'Instagram', color: '#E1306C', placeholder: 'https://instagram.com/yourname' },
                      { key: 'facebook', label: 'Facebook', color: '#1877F2', placeholder: 'https://facebook.com/yourname' },
                      { key: 'youtube', label: 'YouTube', color: '#FF0000', placeholder: 'https://youtube.com/@yourchannel' },
                      { key: 'twitter', label: 'X / Twitter', color: '#555', placeholder: 'https://x.com/yourhandle' },
                      { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', placeholder: 'https://linkedin.com/in/yourprofile' },
                      { key: 'github', label: 'GitHub', color: '#333', placeholder: 'https://github.com/yourusername' },
                      { key: 'tiktok', label: 'TikTok', color: '#555', placeholder: 'https://tiktok.com/@yourname' },
                      { key: 'snapchat', label: 'Snapchat', color: '#c8a800', placeholder: 'Your Snapchat username' },
                      { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', placeholder: '+91 9876543210' },
                      { key: 'phone', label: 'Phone', color: '#34a853', placeholder: '+91 9876543210' },
                    ];
                    return (
                      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {PLATFORMS.map(p => (
                          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: \`\${p.color}18\`, border: \`1.5px solid \${p.color}35\`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: p.color === '#000' || p.color === '#010101' || p.color === '#333' ? 'var(--text-muted)' : p.color }}>
                              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '-0.02em' }}>{p.label.slice(0,2).toUpperCase()}</span>
                            </div>
                            <input
                              type={p.key === 'phone' || p.key === 'whatsapp' ? 'tel' : 'url'}
                              placeholder={p.placeholder}
                              value={draftSocialLinks[p.key] || ''}
                              onChange={e => setDraftSocialLinks(prev => ({ ...prev, [p.key]: e.target.value }))}
                              className="msg-field"
                              style={{ flex: 1, borderRadius: '10px', padding: '7px 10px', fontSize: '12px', height: '34px' }}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Sign Out ── */}`;
content = content.replace(SIGNOUT_ANCHOR, SOCIAL_CARD);

// ─── 5. SHOW SOCIAL LINKS in User Profile Modal (after bio section) ───────────
const MODAL_BIO_ANCHOR = `                {/* Friend badge */}`;
const MODAL_SOCIAL_INSERT = `                {/* Social Links in modal */}
                {viewingUser.socialLinks && Object.values(viewingUser.socialLinks).some(v => v) && (() => {
                  const PLATFORMS = [
                    { key: 'instagram', label: 'Instagram', color: '#E1306C' },
                    { key: 'facebook', label: 'Facebook', color: '#1877F2' },
                    { key: 'youtube', label: 'YouTube', color: '#FF0000' },
                    { key: 'twitter', label: 'X', color: '#555' },
                    { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
                    { key: 'github', label: 'GitHub', color: '#333' },
                    { key: 'tiktok', label: 'TikTok', color: '#555' },
                    { key: 'snapchat', label: 'Snapchat', color: '#c8a800' },
                    { key: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
                    { key: 'phone', label: 'Phone', color: '#34a853' },
                  ];
                  const filled = PLATFORMS.filter(p => viewingUser.socialLinks[p.key]?.trim());
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', padding: '10px 16px 0' }}>
                      {filled.map(p => (
                        <a key={p.key}
                          href={viewingUser.socialLinks[p.key].startsWith('http') ? viewingUser.socialLinks[p.key] : (p.key === 'phone' || p.key === 'whatsapp' ? \`tel:\${viewingUser.socialLinks[p.key]}\` : \`https://\${viewingUser.socialLinks[p.key]}\`)}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: \`\${p.color}18\`, border: \`1.5px solid \${p.color}35\`, borderRadius: '20px', padding: '4px 10px', textDecoration: 'none', color: ['#000','#010101','#333'].includes(p.color) ? 'var(--text-muted)' : p.color, fontSize: '11px', fontWeight: 700 }}
                          title={p.label}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block', opacity: 0.7 }} />
                          {p.label}
                        </a>
                      ))}
                    </div>
                  );
                })()}

                {/* Friend badge */}`;
content = content.replace(MODAL_BIO_ANCHOR, MODAL_SOCIAL_INSERT);

fs.writeFileSync(filePath, content);
console.log('✅ Social links feature patched successfully');
