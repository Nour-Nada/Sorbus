import { useState } from 'react';
import '../styles/SideBar.css';
import sorbusLogo from '../assets/sorbus_logo.png';

function SideBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    // Receives dropped files — wire up API call here later
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    console.log('Dropped files:', files);
  };

  const handleFileSelect = (e) => {
    // Receives files from file picker — wire up API call here later
    const files = e.target.files;
    console.log('Selected files:', files);
  };

  return (
    <>
      <button className="hamburger" onClick={() => setIsOpen(!isOpen)}>
        <span className="material-icons">{isOpen ? 'close' : 'menu'}</span>
      </button>

      <div className={`side-bar ${isOpen ? 'open' : ''}`}>
        <div className="side-bar-logo">
          <img src={sorbusLogo} alt="Sorbus Logo" />
        </div>

        <button className="upload-btn" onClick={() => setIsUploadOpen(true)}>
          <span className="material-icons">upload</span>
          Upload
        </button>
      </div>

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
              <p>Drag & drop files here or click to browse</p>
              <input id="file-input" type="file" multiple hidden onChange={handleFileSelect} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SideBar;
