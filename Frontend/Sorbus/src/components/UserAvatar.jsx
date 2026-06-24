// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
const PALETTE = ['#2e5fa3','#2a7a6a','#5a4fa3','#2a6a8e','#6a4a8a','#3a5e8a','#3a6e52'];

function UserAvatar({ username, size = 'md' }) {
  // Colored circle avatar — letter initial or '?' when username is absent
  const px = { sm: 26, md: 34, lg: 52 }[size] ?? 34;
  const bg = username
    ? PALETTE[username.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]
    : '#3a4460';
  return (
    <div style={{
      width: px, height: px, borderRadius: '50%', background: bg,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(px * 0.38), flexShrink: 0, fontWeight: 600,
    }}>
      {username ? username[0].toUpperCase() : '?'}
    </div>
  );
}

export default UserAvatar;
