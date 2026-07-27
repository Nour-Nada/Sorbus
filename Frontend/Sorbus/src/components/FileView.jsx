// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState } from 'react';
import axios from 'axios';
import { useFileContext } from '../context/FileContext.jsx';
import { useAccountContext } from '../context/AccountContext.jsx';
import ShelfView from './ShelfView.jsx';
import LedgerView from './LedgerView.jsx';
import FileContextMenu from './FileContextMenu.jsx';
import FolderTree from './FolderTree.jsx';
import '../styles/FileView.css';

function getFileIcon(name) {
  // Returns a Material Icon name based on file extension
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','svg','webp','bmp'].includes(ext)) return 'image';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'videocam';
  if (['mp3','wav','flac','aac','ogg'].includes(ext)) return 'audiotrack';
  if (['pdf'].includes(ext)) return 'picture_as_pdf';
  if (['zip','tar','gz','rar','7z'].includes(ext)) return 'folder_zip';
  if (['js','jsx','ts','tsx','py','cpp','c','java','go','rs'].includes(ext)) return 'code';
  if (['txt','md'].includes(ext)) return 'article';
  return 'description';
}

function FileView() {
  const { folderCache, loadFolder, invalidateFolder, currentPath, setCurrentPath, uploadFiles, storageReady, filesLoading, loadErrorPath, scanning } = useFileContext();
  const { userId } = useAccountContext();

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('ledger');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, name, id, isFolder }
  const [draggedItem, setDraggedItem] = useState(null); // { name, id, isFolder }
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedItems, setSelectedItems] = useState(new Set()); // Set of item names
  const [batchDeleteModal, setBatchDeleteModal] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { items: [{ name, id, isFolder }] }
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const currentPathStr = currentPath.join('/');
  const currentItems = folderCache[currentPathStr] ?? []; // flat array of { id, name, isFolder, size, ext }

  const filesError = loadErrorPath === currentPathStr && currentItems.length === 0 && !scanning; // current folder's fetch failed
  const isLoadingFiles = (filesLoading || storageReady === null || scanning) && currentItems.length === 0 && !filesError;

  const filteredItems = currentItems.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSort = (field) => {
    // Toggles direction on the active column; resets to asc on a new column
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedItems = [...filteredItems].sort((a, b) => {
    // Folders always before files; within each group sort by active field
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    let cmp = 0;
    if (sortField === 'name') cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    else if (sortField === 'type') cmp = a.ext.localeCompare(b.ext);
    else if (sortField === 'size') cmp = a.size - b.size;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const navigateTo = (index) => {
    // Slices currentPath back to the clicked breadcrumb level
    setCurrentPath(currentPath.slice(0, index));
    setSearch('');
    setSelectedItems(new Set());
  };

  const openFolder = (name) => {
    // Navigates into a subfolder, loading it if not yet cached
    const newPath = [...currentPath, name];
    const newPathStr = newPath.join('/');
    setCurrentPath(newPath);
    setSearch('');
    setSelectedItems(new Set());
    loadFolder(newPathStr);
  };

  const openContextMenu = (e, item) => {
    // Opens the right-click context menu at the cursor position
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, name: item.name, id: item.id, isFolder: item.isFolder });
  };

  const toggleSelect = (name) => {
    // Adds or removes an item from the multi-selection set
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const startMove = (items) => setMoveModal({ items });

  const handleCreateFolder = async (name) => {
    // Creates a new folder in the current directory then reloads the folder
    setCreatingFolder(false);
    setNewFolderName('');
    if (!name.trim()) return;
    try {
      await axios.post(`/api/files/create/${userId}`, {
        new_name: name.trim(),
        folder_path: currentPathStr,
      });
      invalidateFolder(currentPathStr);
      loadFolder(currentPathStr);
    } catch (err) { console.error('Failed to create folder:', err); }
  };

  const handleMoveSubmit = async (newParent) => {
    // Moves all modal items to newParent then reloads the source folder
    if (newParent === currentPathStr) { setMoveModal(null); setSelectedItems(new Set()); return; }
    await Promise.allSettled(moveModal.items.map(item =>
      axios.patch(`/api/files/move/${item.id}/${userId}`, { new_location: newParent })
    ));
    invalidateFolder(currentPathStr);
    invalidateFolder(newParent);
    loadFolder(currentPathStr);
    setMoveModal(null);
    setSelectedItems(new Set());
  };

  const handleBatchDelete = async () => {
    // Deletes all selected items then reloads the current folder
    const results = await Promise.allSettled([...selectedItems].map(name => {
      const item = currentItems.find(i => i.name === name);
      if (!item) return Promise.resolve();
      return axios.delete(`/api/files/delete/${item.id}/${userId}`);
    }));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.error(`${failed} of ${selectedItems.size} items failed to delete`);
    invalidateFolder(currentPathStr);
    loadFolder(currentPathStr);
    setSelectedItems(new Set());
    setBatchDeleteModal(false);
  };

  const handleDrop = async (targetFolderName) => {
    // Moves the dragged item (or full selection) into a target folder within the current directory
    if (!draggedItem || draggedItem.name === targetFolderName) { setDraggedItem(null); setDragOverFolder(null); return; }
    const newParent = [...currentPath, targetFolderName].join('/');
    const isMultiMove = selectedItems.size > 1 && selectedItems.has(draggedItem.name);
    const itemsToMove = isMultiMove
      ? [...selectedItems]
          .filter(name => name !== targetFolderName)
          .map(name => currentItems.find(i => i.name === name))
          .filter(Boolean)
      : [draggedItem];
    try {
      await Promise.all(itemsToMove.map(item =>
        axios.patch(`/api/files/move/${item.id}/${userId}`, { new_location: newParent })
      ));
      invalidateFolder(currentPathStr);
      invalidateFolder(newParent);
      loadFolder(currentPathStr);
      if (isMultiMove) setSelectedItems(new Set());
    } catch (err) { console.error('Move failed:', err); }
    setDraggedItem(null);
    setDragOverFolder(null);
  };

  const dragProps = (item) => ({
    // Returns drag event handlers for a file/folder row
    draggable: true,
    onDragStart: () => setDraggedItem(item),
    onDragEnd: () => { setDraggedItem(null); setDragOverFolder(null); },
    ...(item.isFolder && {
      onDragOver: e => { e.preventDefault(); setDragOverFolder(item.name); },
      onDragLeave: () => setDragOverFolder(null),
      onDrop: () => handleDrop(item.name),
    }),
  });

  const handleFileDragOver = (e) => {
    // Shows the upload overlay only when dragging external OS files
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDraggingFiles(true); }
  };

  const handleFileDragLeave = (e) => {
    // Hides the overlay only when the cursor actually leaves the view, not a child element
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingFiles(false);
  };

  const handleFileDrop = (e) => {
    // Uploads external files dropped anywhere in the view to the current folder
    if (e.dataTransfer.files.length > 0) { e.preventDefault(); uploadFiles(e.dataTransfer.files); }
    setIsDraggingFiles(false);
  };

  // Paths of folders being moved — excluded from the move tree to prevent moving a folder into itself
  const moveExcludePaths = moveModal
    ? new Set(moveModal.items.filter(i => i.isFolder).map(i => [...currentPath, i.name].join('/')))
    : null;

  return (
    <div
      className="file-view"
      onClick={() => setContextMenu(null)}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >

      {/* Drag-to-upload overlay */}
      {isDraggingFiles && (
        <div className="fv-upload-overlay">
          <span className="material-icons">cloud_upload</span>
          <p>Drop files to upload here</p>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="fv-breadcrumb">
        <button
          className={`fv-crumb ${currentPath.length === 0 ? 'fv-crumb-active' : ''}`}
          onClick={() => navigateTo(0)}
        >
          Home
        </button>
        {currentPath.map((segment, i) => (
          <span key={i} className="fv-crumb-group">
            <span className="material-icons fv-crumb-sep">chevron_right</span>
            <button
              className={`fv-crumb ${i === currentPath.length - 1 ? 'fv-crumb-active' : ''}`}
              onClick={() => navigateTo(i + 1)}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      {/* Top bar — search + sort chips + view toggle */}
      <div className="fv-top-bar">
        <div className="fv-search-wrap">
          <span className="material-icons fv-search-icon">search</span>
          <input
            className="fv-search"
            type="text"
            placeholder="Search in this folder..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="fv-search-clear" onClick={() => setSearch('')}>
              <span className="material-icons">close</span>
            </button>
          )}
        </div>
        <div className="fv-sort-group">
          {(['name', 'type', 'size']).map(field => (
            <button
              key={field}
              className={`fv-sort-chip ${sortField === field ? 'active' : ''}`}
              onClick={() => handleSort(field)}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortField === field && (
                <span className="material-icons">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
              )}
            </button>
          ))}
        </div>
        <div className="fv-view-toggle">
          <button className={`fv-view-btn ${viewMode === 'shelf' ? 'active' : ''}`} onClick={() => setViewMode('shelf')} title="Shelf view">
            <span className="material-icons">grid_view</span>
          </button>
          <button className={`fv-view-btn ${viewMode === 'ledger' ? 'active' : ''}`} onClick={() => setViewMode('ledger')} title="Ledger view">
            <span className="material-icons">view_list</span>
          </button>
        </div>
        <button
          className="fv-new-folder-btn"
          title="New folder"
          onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
        >
          <span className="material-icons">create_new_folder</span>
        </button>
      </div>

      {/* Selection bar — visible when one or more items are selected */}
      {selectedItems.size > 0 && (
        <div className="fv-selection-bar">
          <span className="fv-sel-count">{selectedItems.size} selected</span>
          <button className="fv-sel-btn fv-sel-danger" onClick={() => setBatchDeleteModal(true)}>
            <span className="material-icons">delete_outline</span>Delete
          </button>
          <button className="fv-sel-btn" onClick={() => startMove([...selectedItems].map(n => currentItems.find(i => i.name === n)).filter(Boolean))}>
            <span className="material-icons">drive_file_move_outline</span>Move
          </button>
          <span className="fv-sel-hint">Drag any selected item to move all</span>
          <button className="fv-sel-clear" onClick={() => setSelectedItems(new Set())} title="Clear selection">
            <span className="material-icons">close</span>
          </button>
        </div>
      )}

      {/* File contents */}
      {isLoadingFiles ? (
        <div className="fv-loading">
          <div className="fv-spinner" />
          <p className="fv-loading-text">{scanning ? 'Indexing your files…' : 'Loading your files…'}</p>
        </div>
      ) : filesError ? (
        <div className="fv-uninitialized">
          <span className="material-icons">cloud_off</span>
          <p className="fv-uninitialized-title">Couldn't reach the server</p>
          <p className="fv-uninitialized-hint">Your file server may be offline or unreachable. Make sure it's running, then retry.</p>
          <button className="fv-retry-btn" onClick={() => loadFolder(currentPathStr)}>Retry</button>
        </div>
      ) : !storageReady ? (
        <div className="fv-uninitialized">
          <span className="material-icons">folder_off</span>
          <p className="fv-uninitialized-title">Storage path not configured</p>
          <p className="fv-uninitialized-hint">Go to Account settings to set a storage path before using your files.</p>
        </div>
      ) : viewMode === 'shelf' ? (
        <ShelfView
          sortedItems={sortedItems}
          filteredItems={filteredItems}
          search={search}
          dragOverFolder={dragOverFolder}
          openFolder={openFolder}
          openContextMenu={openContextMenu}
          dragProps={dragProps}
          getFileIcon={getFileIcon}
          selectedItems={selectedItems}
          toggleSelect={toggleSelect}
          onMoveStart={startMove}
          creatingFolder={creatingFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          onCreateFolder={handleCreateFolder}
        />
      ) : (
        <LedgerView
          sortedItems={sortedItems}
          filteredItems={filteredItems}
          search={search}
          dragOverFolder={dragOverFolder}
          openFolder={openFolder}
          openContextMenu={openContextMenu}
          dragProps={dragProps}
          sortField={sortField}
          sortDir={sortDir}
          handleSort={handleSort}
          getFileIcon={getFileIcon}
          selectedItems={selectedItems}
          toggleSelect={toggleSelect}
          onMoveStart={startMove}
          creatingFolder={creatingFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          onCreateFolder={handleCreateFolder}
        />
      )}

      <FileContextMenu contextMenu={contextMenu} setContextMenu={setContextMenu} openFolder={openFolder} onMoveStart={startMove} />

      {/* Batch delete confirmation modal */}
      {batchDeleteModal && (
        <div className="fv-modal-overlay" onClick={() => setBatchDeleteModal(false)}>
          <div className="fv-modal" onClick={e => e.stopPropagation()}>
            <p className="fv-modal-title">Delete {selectedItems.size} items</p>
            <p className="fv-modal-body">
              Permanently delete <span className="fv-modal-filename">{selectedItems.size} selected items</span>?
              <br />Any folders will have all their contents deleted too.
              <br />This cannot be undone.
            </p>
            <div className="fv-modal-actions">
              <button className="fv-modal-cancel" onClick={() => setBatchDeleteModal(false)}>Cancel</button>
              <button className="fv-modal-danger" onClick={handleBatchDelete}>Delete all</button>
            </div>
          </div>
        </div>
      )}

      {/* Move destination picker */}
      {moveModal && (
        <div className="fv-modal-overlay" onClick={() => setMoveModal(null)}>
          <div className="fv-modal" onClick={e => e.stopPropagation()}>
            <p className="fv-modal-title">
              Move {moveModal.items.length === 1 ? `"${moveModal.items[0].name}"` : `${moveModal.items.length} items`}
            </p>
            <div className="fv-move-list">
              <button className="fv-move-home" onClick={() => handleMoveSubmit('')}>
                <span className="material-icons">home</span>
                Home
              </button>
              <div className="fv-move-tree-divider" />
              <FolderTree onSelect={handleMoveSubmit} excludePaths={moveExcludePaths} />
            </div>
            <div className="fv-modal-actions">
              <button className="fv-modal-cancel" onClick={() => setMoveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default FileView;
