import { useState } from 'react';
import axios from 'axios';
import { useFileContext } from '../context/FileContext.jsx';
import { useAccountContext } from '../context/AccountContext.jsx';

function FileItemActions({ name, node, isFolder, openFolder, onRenameStart, onMoveStart }) {
  // Per-item action buttons — rename is inline (signalled via onRenameStart), delete has its own modal
  const { fileIds, currentPath, refreshFiles } = useFileContext();
  const { userId } = useAccountContext();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const triggerDownload = async (fileId, filename) => {
    // Gets a short-lived signed token then hands the download off to the native browser downloader
    try {
      const { data } = await axios.get(`/api/files/download-token/${fileId}/${userId}`);
      const a = document.createElement('a');
      a.href = `/api/files/download-stream/${fileId}/${userId}?token=${data.token}`;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (err) { console.error('Download failed:', err); }
  };

  const handleDownload = async (e) => {
    // Downloads a file via signed token
    e.stopPropagation();
    const fileId = fileIds[node];
    if (fileId) await triggerDownload(fileId, name);
  };

  const handleFolderDownload = async (e) => {
    // Downloads a folder as a zip via signed token
    e.stopPropagation();
    const folderId = fileIds[[...currentPath, name].join('/')];
    if (folderId) await triggerDownload(folderId, name + '.zip');
  };

  const handleRenameSubmit = async (newValue) => {
    // Submits the rename to the API and refreshes the file tree
    if (!newValue.trim() || newValue.trim() === name) return;
    const id = isFolder ? fileIds[[...currentPath, name].join('/')] : fileIds[node];
    if (!id) return;
    try {
      await axios.patch(`/api/files/name/${id}/${userId}`, { new_name: newValue.trim() });
      refreshFiles();
    } catch (err) { console.error('Rename failed:', err); }
  };

  const handleDelete = async () => {
    // Deletes the file or folder (server cascades folder deletes) and refreshes
    const id = isFolder ? fileIds[[...currentPath, name].join('/')] : fileIds[node];
    if (!id) return;
    try {
      await axios.delete(`/api/files/delete/${id}/${userId}`);
      refreshFiles();
      setDeleteOpen(false);
    } catch (err) { console.error('Delete failed:', err); }
  };

  return (
    <>
      <div className="fv-actions">
        {isFolder ? (
          <>
            <button className="fv-act-btn" title="Open" onClick={e => { e.stopPropagation(); openFolder(name); }}>
              <span className="material-icons">folder_open</span>
            </button>
            <button className="fv-act-btn" title="Download" onClick={handleFolderDownload}>
              <span className="material-icons">download</span>
            </button>
            <button className="fv-act-btn fv-act-move" title="Move" onClick={e => { e.stopPropagation(); onMoveStart([{ name, node, isFolder: true }]); }}>
              <span className="material-icons">drive_file_move_outline</span>
            </button>
            <button className="fv-act-btn" title="Rename" onClick={e => { e.stopPropagation(); onRenameStart(name, handleRenameSubmit); }}>
              <span className="material-icons">drive_file_rename_outline</span>
            </button>
            <button className="fv-act-btn fv-act-danger" title="Delete" onClick={e => { e.stopPropagation(); setDeleteOpen(true); }}>
              <span className="material-icons">delete_outline</span>
            </button>
          </>
        ) : (
          <>
            <button className="fv-act-btn" title="Download" onClick={handleDownload}>
              <span className="material-icons">download</span>
            </button>
            <button className="fv-act-btn fv-act-move" title="Move" onClick={e => { e.stopPropagation(); onMoveStart([{ name, node, isFolder: false }]); }}>
              <span className="material-icons">drive_file_move_outline</span>
            </button>
            <button className="fv-act-btn" title="Rename" onClick={e => { e.stopPropagation(); onRenameStart(name, handleRenameSubmit); }}>
              <span className="material-icons">drive_file_rename_outline</span>
            </button>
            <button className="fv-act-btn fv-act-danger" title="Delete" onClick={e => { e.stopPropagation(); setDeleteOpen(true); }}>
              <span className="material-icons">delete_outline</span>
            </button>
          </>
        )}
      </div>

      {deleteOpen && (
        <div className="fv-modal-overlay" onClick={() => setDeleteOpen(false)}>
          <div className="fv-modal" onClick={e => e.stopPropagation()}>
            <p className="fv-modal-title">{isFolder ? 'Delete folder' : 'Delete file'}</p>
            <p className="fv-modal-body">
              Permanently delete <span className="fv-modal-filename">{name}</span>?
              {isFolder && <><br />All contents will also be deleted.</>}
              <br />This cannot be undone.
            </p>
            <div className="fv-modal-actions">
              <button className="fv-modal-cancel" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="fv-modal-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FileItemActions;
