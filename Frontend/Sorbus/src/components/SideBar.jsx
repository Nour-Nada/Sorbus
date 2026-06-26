// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountContext } from '../context/AccountContext.jsx';
import { useFileContext } from '../context/FileContext.jsx';
import { useAuthContext } from '../context/AuthContext.jsx';
import { flushSync } from 'react-dom';
import axios from 'axios';
import '../styles/SideBar.css';
import sorbusLogo from '../assets/sorbus_logo.png';
import FolderTree from './FolderTree.jsx';
import UserAvatar from './UserAvatar.jsx';

function SideBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [storageFree, setStorageFree] = useState(null);
  const [storageUsed, setStorageUsed] = useState(null);

  const { username, access } = useAccountContext();
  const { setCurrentPath, uploadFiles, storageReady } = useFileContext();
  const { logout } = useAuthContext();
  const navigate = useNavigate();

  const closeUpload = () => setIsUploadOpen(false); //Closes the upload modal (progress keeps showing in the corner toast)

  useEffect(() => {
    // Fetches free disk space and total used file size when storage becomes available
    if (!storageReady) return;
    axios.get('/api/files/storage')
      .then(res => { setStorageFree(res.data.free); setStorageUsed(res.data.used); })
      .catch(err => console.error('Failed to fetch storage info:', err));
  }, [storageReady]);

  const formatBytes = (bytes) => {
    // Converts raw bytes to a readable GB/MB string
    if (bytes == null) return '—';
    const gb = bytes / (1024 ** 3);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    // Uploads the files dropped into the drop zone
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => {
    // Uploads the files chosen from the file picker
    if (e.target.files.length > 0) uploadFiles(e.target.files);
    e.target.value = ''; //Reset so picking the same file again still fires onChange
  };

  const handleLogout = (e) => {
    e.stopPropagation();
    flushSync(() => logout()); //need to put a flush sync here to ensure logout state updates before navigate runs and because otherwise the ProtectedRoute componet updates later then the navigate runs and causes the unauthorized page to show up instead
    navigate('/login');
  };

  return (
    <>
      <button className="hamburger" onClick={() => setIsOpen(!isOpen)}>
        <span className="material-icons">{isOpen ? 'close' : 'menu'}</span>
      </button>

      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <div className={`side-bar ${isOpen ? 'open' : ''}`}>

        {/* Logo */}
        <button className="side-bar-logo" onClick={() => navigate('/')}>
          <img src={sorbusLogo} alt="Sorbus Logo" />
        </button>

        {/* Upload button */}
        <button className="upload-btn" onClick={() => setIsUploadOpen(true)}>
          <span className="material-icons">upload</span>
          Upload
        </button>

        {/* Files tree */}
        <div className="side-bar-files">
          <p className="side-bar-section-label">FILES</p>
          <div className="side-bar-tree">
            <FolderTree onSelect={(path) => setCurrentPath(path.split('/'))} />
          </div>
        </div>

        {/* Bottom section — account info and storage */}
        <div className="side-bar-bottom">
          <div className="side-bar-user-row">
            <div className="side-bar-user" onClick={() => navigate('/account')}>
              <UserAvatar username={username} />
              <div className="user-info">
                <p className="user-name">{username || 'Unknown'}</p>
                <p className="user-role">{access || '—'}</p>
              </div>
            </div>
            <button className="logout-btn" title="Logout" onClick={handleLogout}>
              <span className="material-icons">logout</span>
            </button>
          </div>

          <div className="side-bar-storage">
            <p className="storage-label">
              {formatBytes(storageUsed)} of {formatBytes(storageFree != null && storageUsed != null ? storageUsed + storageFree : null)} used
            </p>
            <div className="storage-bar-track">
              <div
                className="storage-bar-fill"
                style={{
                  width: storageFree != null && storageUsed != null
                    ? `${Math.min((storageUsed / (storageUsed + storageFree)) * 100, 100)}%`
                    : '0%'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal */}
      {isUploadOpen && (
        <div className="upload-overlay" onClick={closeUpload}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <button className="upload-close" onClick={closeUpload}>
              <span className="material-icons">close</span>
            </button>
            <div
              className={`upload-drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
            >
              <span className="material-icons">cloud_upload</span>
              <p>Upload Files Here</p>
              <input id="file-input" type="file" multiple hidden onChange={handleFileSelect} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SideBar;
