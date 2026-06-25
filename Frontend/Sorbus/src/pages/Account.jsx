// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountContext } from '../context/AccountContext.jsx';
import { useFileContext } from '../context/FileContext.jsx';
import axios from 'axios';
import UserAvatar from '../components/UserAvatar.jsx';
import sorbusLogo from '../assets/sorbus_logo.png';
import '../styles/Account.css';

function Account() {
  const { userId, username, access, refreshServerPath } = useAccountContext();
  const { refreshFiles } = useFileContext();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [localAccess, setLocalAccess] = useState({});  // userId → 'editor'|'viewer'
  const [pendingAccess, setPendingAccess] = useState(null);  // { id, access }
  const [confirmDelete, setConfirmDelete] = useState(null);  // userId
  const [storageFree, setStorageFree] = useState(null);
  const [storageUsed, setStorageUsed] = useState(null);
  const [savedPath, setSavedPath] = useState('');
  const [pathEditing, setPathEditing] = useState(false);
  const [editPath, setEditPath] = useState('');
  const [confirmPath, setConfirmPath] = useState(false);
  const [pathFeedback, setPathFeedback] = useState(null);  // { ok, msg }
  const [confirmReinit, setConfirmReinit] = useState(false);
  const pathInputRef = useRef(null);
  const [loading, setLoading] = useState(true); //True while the initial account data loads
  const [pathBusy, setPathBusy] = useState(false); //True while a storage-path change is indexing

  useEffect(() => {
    // Verify session and load all page data on mount
    Promise.all([
      axios.get('/api/user/verify'),
      axios.get('/api/user/name'),
      axios.get('/api/files/storage'),
      axios.get('/api/files/filesizes'),
      axios.get('/api/features/location'),
    ]).then(([, usersRes, freeRes, usedRes, locationRes]) => {
      const entries = Object.entries(usersRes.data)
        .map(([name, val]) => ({ name, id: val.id, email: val.email, access: val.access }))
        .sort((a, b) => (a.id === userId ? -1 : b.id === userId ? 1 : 0));
      setUsers(entries);
      const initialAccess = {};
      entries.forEach(e => { initialAccess[e.id] = e.access; });
      setLocalAccess(initialAccess);
      setStorageFree(freeRes.data);
      setStorageUsed(usedRes.data);
      setSavedPath(locationRes.data || '');
    }).catch(err => console.error('Failed to load account data:', err))
      .finally(() => setLoading(false));
  }, [userId]);

  const formatBytes = (bytes) => {
    if (bytes == null) return '—';
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  };

  const totalStorage = storageFree != null && storageUsed != null ? storageUsed + storageFree : null;
  const usedPct = totalStorage ? Math.min((storageUsed / totalStorage) * 100, 100) : 0;

  const confirmAccess = async () => {
    if (!pendingAccess) return;
    try {
      await axios.patch(`/api/user/change/access/${userId}/${pendingAccess.id}/${pendingAccess.access}`);
      setLocalAccess(prev => ({ ...prev, [pendingAccess.id]: pendingAccess.access }));
    } catch (err) {
      console.error('Failed to change access:', err);
    } finally {
      setPendingAccess(null);
    }
  };

  const handleDelete = async (targetId) => {
    try {
      await axios.delete(`/api/user/delete/${userId}/${targetId}`);
      setUsers(prev => prev.filter(u => u.id !== targetId));
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setConfirmDelete(null);
    }
  };

  useEffect(() => {
    // Focus the path input when entering edit mode
    if (pathEditing) pathInputRef.current?.focus();
  }, [pathEditing]);

  const friendlyPathError = (raw) => {
    // Translates C++ server error strings into user-readable messages
    if (typeof raw !== 'string') return 'Failed to update path.';
    if (raw.includes('Incorrect Parameter')) return 'Path does not exist, is not absolute, or is not a valid directory.';
    if (/max|too many|limit/i.test(raw)) return 'Too many files to index at this path.';
    return raw;
  };

  const handlePathChange = async () => {
    const previousPath = savedPath;
    setSavedPath(editPath); //Optimistically show the new path right away
    setPathEditing(false);
    setConfirmPath(false);
    setPathBusy(true);
    setPathFeedback({ ok: true, msg: 'Indexing… this may take a while for large folders.' });
    try {
      await axios.patch(`/api/features/location/${userId}`, { new_location: editPath });
      setPathFeedback({ ok: true, msg: 'Path updated.' });
      refreshServerPath();
      refreshFiles();
    } catch (err) {
      setSavedPath(previousPath); //Revert the optimistic path on failure
      setPathFeedback({ ok: false, msg: friendlyPathError(err.response?.data) });
    } finally {
      setPathBusy(false);
    }
  };

  const handleReinit = async () => {
    try {
      await axios.patch(`/api/features/reinitialize/${userId}`);
    } catch (err) {
      console.error('Failed to reinitialize:', err);
    } finally {
      setConfirmReinit(false);
    }
  };

  return (
    <div className="ac-page">
      <div className="ac-topbar">
        <button className="ac-back-btn" onClick={() => navigate('/home')}>
          <span className="material-icons">arrow_back</span>
          Files
        </button>
        <div className="ac-topbar-center">
          <span className="ac-title">Account</span>
          <button className="ac-logo-btn" onClick={() => navigate('/')}>
            <img src={sorbusLogo} alt="Sorbus" className="ac-logo" />
          </button>
        </div>
        <div className="ac-topbar-right">
          <UserAvatar username={username} size="sm" />
          <span className="ac-topbar-username">{username || '—'}</span>
        </div>
      </div>

      <div className="ac-body">
        {loading && (
          <div className="ac-loading-banner">
            <div className="ac-spinner" />
            <span>Loading account data…</span>
          </div>
        )}
        {/* Box 1: Users */}
        <div className="ac-box">
          <h2 className="ac-box-title">
            <span className="material-icons">group</span>
            {users.length} {users.length === 1 ? 'User' : 'Users'}
          </h2>
          <div className="ac-user-list">
            {users.map(u => {
              const isMe = u.id === userId;
              const isPending = pendingAccess !== null && pendingAccess.id === u.id;
              const isDeleting = confirmDelete !== null && confirmDelete === u.id;
              const curAccess = localAccess[u.id];
              return (
                <div key={u.id} className={`ac-user-row${isMe ? ' ac-user-me' : ''}`}>
                  <UserAvatar username={u.name} size="sm" />
                  <div className="ac-user-info">
                    <div className="ac-user-name-row">
                      <span className="ac-user-name">{u.name}</span>
                      {isMe && <span className="ac-you-tag">You</span>}
                      {curAccess && <span className="ac-access-badge">{curAccess}</span>}
                    </div>
                    <span className="ac-user-email">{u.email}</span>
                  </div>
                  {!isMe && (
                    <div className="ac-user-controls">
                      {access === 'owner' ? (
                        isDeleting ? (
                          <>
                            <span className="ac-confirm-label">Delete {u.name}?</span>
                            <button className="ac-ctrl-btn ac-danger" onClick={() => handleDelete(u.id)}>Yes</button>
                            <button className="ac-ctrl-btn" onClick={() => setConfirmDelete(null)}>No</button>
                          </>
                        ) : isPending ? (
                          <>
                            <button className="ac-ctrl-btn ac-primary" onClick={confirmAccess}>Confirm</button>
                            <button className="ac-ctrl-btn" onClick={() => setPendingAccess(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <select className="ac-access-select" value={curAccess || ''} onChange={e => setPendingAccess({ id: u.id, access: e.target.value })}>
                              <option value="" disabled>Set role</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button className="ac-icon-btn" title="Delete user" onClick={() => setConfirmDelete(u.id)}>
                              <span className="material-icons">delete</span>
                            </button>
                          </>
                        )
                      ) : (
                        <select className="ac-access-select" disabled value="">
                          <option value="" disabled>—</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Box 2: Storage & Admin */}
        <div className="ac-box">
          <h2 className="ac-box-title">
            <span className="material-icons">storage</span>
            Storage & Admin
          </h2>
          <div className="ac-storage-section">
            <div className="ac-ring" style={{ '--pct': `${usedPct.toFixed(1)}%` }}>
              <div className="ac-ring-inner">
                <span className="ac-ring-used">{formatBytes(storageUsed)}</span>
                <span className="ac-ring-sub">of {formatBytes(totalStorage)}</span>
              </div>
            </div>
            <div className="ac-free-display">
              <span className="ac-free-num">{formatBytes(storageFree)}</span>
              <span className="ac-free-label">free</span>
            </div>
          </div>

          {access === 'owner' && (
            <div className="ac-admin">
              <div className="ac-admin-section">
                <label className="ac-label">Storage path</label>
                <div className="ac-path-row">
                  <input
                    ref={pathInputRef}
                    className={`ac-input${pathEditing ? '' : ' ac-input-readonly'}`}
                    value={pathEditing ? editPath : savedPath}
                    readOnly={!pathEditing}
                    onChange={e => { setEditPath(e.target.value); setPathFeedback(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') setConfirmPath(true); if (e.key === 'Escape') { setPathEditing(false); setConfirmPath(false); } }}
                    placeholder="Absolute path..."
                  />
                  {pathEditing ? (
                    <>
                      <button className="ac-btn ac-btn-primary" onClick={() => setConfirmPath(true)}>Change</button>
                      <button className="ac-btn" onClick={() => { setPathEditing(false); setConfirmPath(false); setPathFeedback(null); }}>Cancel</button>
                    </>
                  ) : (
                    <button className="ac-btn" disabled={pathBusy} onClick={() => { setPathEditing(true); setEditPath(savedPath); setPathFeedback(null); }}>Edit</button>
                  )}
                </div>
                {confirmPath && (
                  <div className="ac-path-confirm">
                    <p className="ac-confirm-warning">This will delete all file records and re-index from the new path. Files on disk are not affected.</p>
                    <div className="ac-reinit-row">
                      <button className="ac-btn ac-btn-danger" onClick={handlePathChange}>Confirm</button>
                      <button className="ac-btn" onClick={() => setConfirmPath(false)}>Cancel</button>
                    </div>
                  </div>
                )}
                {pathFeedback && <p className={`ac-feedback ${pathFeedback.ok ? 'ac-ok' : 'ac-err'}`}>{pathFeedback.msg}</p>}
              </div>
              <div className="ac-admin-section">
                <label className="ac-label">Reinitialize</label>
                <p className="ac-hint">Rebuilds the file database from disk. Use after moving files manually.</p>
                {confirmReinit ? (
                  <div className="ac-reinit-row">
                    <span className="ac-confirm-label">Are you sure?</span>
                    <button className="ac-btn ac-btn-danger" onClick={handleReinit}>Confirm</button>
                    <button className="ac-btn" onClick={() => setConfirmReinit(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="ac-btn" onClick={() => setConfirmReinit(true)}>
                    <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>refresh</span>
                    Rescan disk
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Account;
