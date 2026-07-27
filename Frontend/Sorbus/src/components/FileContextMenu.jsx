// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useFileContext } from '../context/FileContext.jsx';
import { useAccountContext } from '../context/AccountContext.jsx';

function FileContextMenu({ contextMenu, setContextMenu, openFolder, onMoveStart }) {
  // Positioned right-click menu; contextMenu = { x, y, name, id, isFolder }
  const { currentPath, invalidateFolder, loadFolder } = useFileContext();
  const { userId } = useAccountContext();
  const [renameModal, setRenameModal] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    // Close the context menu whenever the user clicks elsewhere on the page
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [setContextMenu]);

  useEffect(() => {
    if (renameModal) renameInputRef.current?.focus();
  }, [renameModal]);

  const triggerDownload = async (fileId, filename) => {
    // Gets a short-lived signed token then hands the download off to the native browser downloader
    try {
      const { data } = await axios.get(`/api/files/download-token/${fileId}/${userId}`);
      const a = document.createElement('a');
      a.href = `${import.meta.env.VITE_API_URL || ''}/api/files/download-stream/${fileId}/${userId}?token=${data.token}`; //Absolute so the native download hits the gateway, not the static frontend
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) { console.error('Download failed:', err); }
  };

  const handleDownload = async (name, id) => {
    // Downloads a file via signed token
    await triggerDownload(id, name);
  };

  const handleFolderDownload = async (name, id) => {
    // Downloads a folder as a zip via signed token
    await triggerDownload(id, name + '.zip');
  };

  const handleRenameSubmit = async () => {
    // Submits the rename and reloads the current folder
    if (!renameModal || !renameValue.trim()) return;
    try {
      await axios.patch(`/api/files/name/${renameModal.id}/${userId}`, { new_name: renameValue.trim() });
      const pathStr = currentPath.join('/');
      invalidateFolder(pathStr);
      loadFolder(pathStr);
      setRenameModal(null);
    } catch (err) { console.error('Rename failed:', err); }
  };

  const handleDelete = async () => {
    // Deletes the file or folder and reloads the current folder
    if (!deleteModal) return;
    try {
      await axios.delete(`/api/files/delete/${deleteModal.id}/${userId}`);
      const pathStr = currentPath.join('/');
      invalidateFolder(pathStr);
      loadFolder(pathStr);
      setDeleteModal(null);
    } catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <>
      {contextMenu && (
        <div
          className="fv-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.isFolder ? (
            <>
              <button className="fv-ctx-item" onClick={() => { openFolder(contextMenu.name); setContextMenu(null); }}>
                <span className="material-icons">folder_open</span>Open
              </button>
              <button className="fv-ctx-item" onClick={() => { handleFolderDownload(contextMenu.name, contextMenu.id); setContextMenu(null); }}>
                <span className="material-icons">download</span>Download
              </button>
              <button className="fv-ctx-item" onClick={() => { setRenameValue(contextMenu.name); setRenameModal({ name: contextMenu.name, id: contextMenu.id, isFolder: true }); setContextMenu(null); }}>
                <span className="material-icons">drive_file_rename_outline</span>Rename
              </button>
              <button className="fv-ctx-item" onClick={() => { onMoveStart([{ id: contextMenu.id, name: contextMenu.name, isFolder: true }]); setContextMenu(null); }}>
                <span className="material-icons">drive_file_move_outline</span>Move to
              </button>
              <div className="fv-ctx-divider" />
              <button className="fv-ctx-item fv-ctx-danger" onClick={() => { setDeleteModal({ name: contextMenu.name, id: contextMenu.id, isFolder: true }); setContextMenu(null); }}>
                <span className="material-icons">delete_outline</span>Delete
              </button>
            </>
          ) : (
            <>
              <button className="fv-ctx-item" onClick={() => { handleDownload(contextMenu.name, contextMenu.id); setContextMenu(null); }}>
                <span className="material-icons">download</span>Download
              </button>
              <button className="fv-ctx-item" onClick={() => { setRenameValue(contextMenu.name); setRenameModal({ name: contextMenu.name, id: contextMenu.id, isFolder: false }); setContextMenu(null); }}>
                <span className="material-icons">drive_file_rename_outline</span>Rename
              </button>
              <button className="fv-ctx-item" onClick={() => { onMoveStart([{ id: contextMenu.id, name: contextMenu.name, isFolder: false }]); setContextMenu(null); }}>
                <span className="material-icons">drive_file_move_outline</span>Move to
              </button>
              <div className="fv-ctx-divider" />
              <button className="fv-ctx-item fv-ctx-danger" onClick={() => { setDeleteModal({ name: contextMenu.name, id: contextMenu.id, isFolder: false }); setContextMenu(null); }}>
                <span className="material-icons">delete_outline</span>Delete
              </button>
            </>
          )}
        </div>
      )}

      {renameModal && (
        <div className="fv-modal-overlay" onClick={() => setRenameModal(null)}>
          <div className="fv-modal" onClick={e => e.stopPropagation()}>
            <p className="fv-modal-title">{renameModal.isFolder ? 'Rename folder' : 'Rename file'}</p>
            <input
              ref={renameInputRef}
              className="fv-modal-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenameModal(null); }}
            />
            <div className="fv-modal-actions">
              <button className="fv-modal-cancel" onClick={() => setRenameModal(null)}>Cancel</button>
              <button className="fv-modal-confirm" onClick={handleRenameSubmit}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fv-modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="fv-modal" onClick={e => e.stopPropagation()}>
            <p className="fv-modal-title">{deleteModal.isFolder ? 'Delete folder' : 'Delete file'}</p>
            <p className="fv-modal-body">
              Permanently delete <span className="fv-modal-filename">{deleteModal.name}</span>?
              {deleteModal.isFolder && <><br />All contents will also be deleted.</>}
              <br />This cannot be undone.
            </p>
            <div className="fv-modal-actions">
              <button className="fv-modal-cancel" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button className="fv-modal-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FileContextMenu;
