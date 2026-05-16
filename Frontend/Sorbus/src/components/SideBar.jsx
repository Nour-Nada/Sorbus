import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/SideBar.css';
import sorbusLogo from '../assets/sorbus_logo.png';
import { useAccountContext } from '../context/AccountContext.jsx';
import { useFileContext } from '../context/FileContext.jsx';

function SideBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [storageFree, setStorageFree] = useState(null);
  const [storageUsed, setStorageUsed] = useState(null);

  const { username, access } = useAccountContext();
  const { tree, fileIds } = useFileContext();
  const navigate = useNavigate();

  useEffect(() => {
    // Fetches free disk space and total used file size, re-runs whenever the file tree changes
    Promise.all([
      axios.get('/api/files/storage'),
      axios.get('/api/files/filesizes'),
    ]).then(([freeRes, usedRes]) => {
      setStorageFree(freeRes.data);
      setStorageUsed(usedRes.data);
    }).catch(err => console.error('Failed to fetch storage info:', err));
  }, [tree]);

  const formatBytes = (bytes) => {
    // Converts raw bytes to a readable GB/MB string
    if (bytes == null) return '—';
    const gb = bytes / (1024 ** 3);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    // Receives dropped files — wire up API call here later
    e.preventDefault();
    setIsDragging(false);
    // console.log('Dropped files:', e.dataTransfer.files);
  };

  const handleFileSelect = (e) => {
    // Receives files from file picker — wire up API call here later
    console.log('Selected files:', e.target.files);
  };

  console.log('File IDs:', fileIds);

  return (
    <>
      <button className="hamburger" onClick={() => setIsOpen(!isOpen)}>
        <span className="material-icons">{isOpen ? 'close' : 'menu'}</span>
      </button>

      <div className={`side-bar ${isOpen ? 'open' : ''}`}>

        {/* Logo */}
        <div className="side-bar-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
        </div>

        {/* Upload button */}
        <button className="upload-btn" onClick={() => setIsUploadOpen(true)}>
          <span className="material-icons">upload</span>
          Upload
        </button>

        {/* Files tree area — populated later from FileContext */}
        <div className="side-bar-files">
          <p className="side-bar-section-label">FILES</p>
          <div className="side-bar-tree">
            {Object.keys(fileIds).map((fileName, fileId) => {
              console.log(fileName, fileId);
              return (
                <button className="side-bar-file-btn" key={fileId}>
                  <p>test</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom section — account info and storage */}
        <div className="side-bar-bottom">
          {access === 'owner' && (
            <button className="admin-btn" onClick={() => navigate('/account')}>
              <span className="material-icons">settings</span>
              Admin Panel
            </button>
          )}

          <div className="side-bar-user" onClick={() => navigate('/account')}>
            <div className="user-avatar">{username ? username[0].toUpperCase() : '?'}</div>
            <div className="user-info">
              <p className="user-name">{username || 'Unknown'}</p>
              <p className="user-role">{access || '—'}</p>
            </div>
            <button className="logout-btn" title="Logout" onClick={(e) => e.stopPropagation()}>
              <span className="material-icons">logout</span>
            </button>
          </div>

          <div className="side-bar-storage">
            <p className="storage-label">{formatBytes(storageUsed)} used · {formatBytes(storageFree)} free</p>
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
        <div className="upload-overlay" onClick={() => setIsUploadOpen(false)}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <button className="upload-close" onClick={() => setIsUploadOpen(false)}>
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
