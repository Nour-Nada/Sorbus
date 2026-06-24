// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useEffect } from 'react';
import { useFileContext } from '../context/FileContext.jsx';
import '../styles/UploadToast.css';

function UploadToast() {
  const { uploads, clearUploads } = useFileContext();

  const allDone = uploads.length > 0 && uploads.every(u => u.status !== 'uploading'); //True once every file has finished or failed

  useEffect(() => {
    // Auto-dismisses the toast 4s after the whole batch finishes
    if (!allDone) return;
    const timer = setTimeout(clearUploads, 4000);
    return () => clearTimeout(timer);
  }, [allDone, clearUploads]);

  if (uploads.length === 0) return null;

  const doneCount = uploads.filter(u => u.status === 'done').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;

  return (
    <div className="upload-toast">
      <div className="upload-toast-header">
        <span className="upload-toast-title">
          {allDone
            ? `${doneCount} uploaded${errorCount ? ` · ${errorCount} failed` : ''}`
            : `Uploading ${uploads.length} file${uploads.length > 1 ? 's' : ''}…`}
        </span>
        <button className="upload-toast-close" onClick={clearUploads} title="Dismiss">
          <span className="material-icons">close</span>
        </button>
      </div>
      <div className="upload-toast-list">
        {uploads.map((u, i) => (
          <div key={i} className={`upload-toast-item ${u.status}`}>
            <span className="upload-toast-name">{u.name}</span>
            <span className="upload-toast-status">
              {u.status === 'error' ? u.error : u.status === 'done' ? 'Done' : `${u.progress}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default UploadToast;
