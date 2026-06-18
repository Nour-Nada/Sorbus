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
  const { tree, fileIds, fileInfo, currentPath, setCurrentPath, refreshFiles } = useFileContext();
  const { userId } = useAccountContext();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('ledger');
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [batchDeleteModal, setBatchDeleteModal] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { items: [{name, node, isFolder}] }

  const getCurrentDir = () => {
    // Walks the tree along currentPath to return the active folder's contents
    let dir = tree;
    for (const segment of currentPath) {
      if (dir[segment] && typeof dir[segment] === 'object') dir = dir[segment];
      else return {};
    }
    return dir;
  };

  const currentDir = getCurrentDir();

  const filteredEntries = Object.entries(currentDir).filter(([name]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSort = (field) => {
    // Toggles direction when clicking the active column; switches to asc when picking a new one
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getItemSize = (name, node) => {
    // Returns raw bytes for a file, or the recursive total of all files inside a folder
    if (typeof node === 'string') return fileInfo[node]?.size ?? -1;
    const prefix = [...currentPath, name].join('/') + '/';
    return Object.entries(fileInfo).reduce((sum, [path, info]) => {
      return (path.startsWith(prefix) && !info.isFolder && info.size >= 0) ? sum + info.size : sum;
    }, 0);
  };

  const sortedEntries = [...filteredEntries].sort(([nameA, nodeA], [nameB, nodeB]) => {
    // Folders always sort before files regardless of sort field; within each group sort by active field
    const aIsFolder = nodeA !== null && typeof nodeA === 'object';
    const bIsFolder = nodeB !== null && typeof nodeB === 'object';
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    let cmp = 0;
    if (sortField === 'name') {
      cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    } else if (sortField === 'type') {
      const typeA = aIsFolder ? '' : (fileInfo[nodeA]?.ext ?? '');
      const typeB = bIsFolder ? '' : (fileInfo[nodeB]?.ext ?? '');
      cmp = typeA.localeCompare(typeB);
    } else if (sortField === 'size') {
      cmp = getItemSize(nameA, nodeA) - getItemSize(nameB, nodeB);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const navigateTo = (index) => {
    // Slices currentPath back to the clicked breadcrumb level
    setCurrentPath(currentPath.slice(0, index));
    setSearch('');
    setSelectedItems(new Set());
  };

  const openFolder = (name) => {
    // Navigates into a subfolder and clears search and selection
    setCurrentPath([...currentPath, name]);
    setSearch('');
    setSelectedItems(new Set());
  };

  const openContextMenu = (e, name, node) => {
    // Opens the right-click context menu at the cursor position
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, name, node, isFolder: node !== null && typeof node === 'object' });
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

  const handleMoveSubmit = async (newParent) => {
    // Moves all modal items to newParent concurrently then refreshes
    if (newParent === currentPath.join('/')) { setMoveModal(null); setSelectedItems(new Set()); return; }
    await Promise.allSettled(moveModal.items.map(async item => {
      if (item.isFolder) {
        const folderId = fileIds[[...currentPath, item.name].join('/')];
        if (!folderId) return;
        await axios.patch(`/api/files/move/${folderId}/${userId}`, { new_location: newParent });
      } else {
        const fileId = fileIds[item.node];
        if (!fileId) return;
        await axios.patch(`/api/files/move/${fileId}/${userId}`, { new_location: newParent });
      }
    }));
    refreshFiles();
    setMoveModal(null);
    setSelectedItems(new Set());
  };

  const handleBatchDelete = async () => {
    // Deletes all selected items concurrently; uses allSettled so partial failures still refresh the tree
    const results = await Promise.allSettled([...selectedItems].map(async name => {
      const node = currentDir[name];
      const isFolder = node !== null && typeof node === 'object';
      const id = isFolder ? fileIds[[...currentPath, name].join('/')] : fileIds[node];
      if (!id) return;
      await axios.delete(`/api/files/delete/${id}/${userId}`);
    }));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.error(`${failed} of ${selectedItems.size} items failed to delete`);
    refreshFiles();
    setSelectedItems(new Set());
    setBatchDeleteModal(false);
  };

  const handleDrop = async (targetFolderName) => {
    // Moves the dragged item into the target folder; if it's part of a selection, moves all selected items
    if (!draggedItem || draggedItem.name === targetFolderName) { setDraggedItem(null); setDragOverFolder(null); return; }
    const newParent = [...currentPath, targetFolderName].join('/');
    const isMultiMove = selectedItems.size > 1 && selectedItems.has(draggedItem.name);
    const itemsToMove = isMultiMove
      ? [...selectedItems]
          .filter(name => name !== targetFolderName)
          .map(name => ({ name, node: currentDir[name], isFolder: currentDir[name] !== null && typeof currentDir[name] === 'object' }))
      : [draggedItem];
    try {
      await Promise.all(itemsToMove.map(async item => {
        if (item.isFolder) {
          const folderId = fileIds[[...currentPath, item.name].join('/')];
          if (!folderId) return;
          await axios.patch(`/api/files/move/${folderId}/${userId}`, { new_location: newParent });
        } else {
          const fileId = fileIds[item.node];
          if (!fileId) return;
          await axios.patch(`/api/files/move/${fileId}/${userId}`, { new_location: newParent });
        }
      }));
      refreshFiles();
      if (isMultiMove) setSelectedItems(new Set());
    } catch (err) { console.error('Move failed:', err); }
    setDraggedItem(null);
    setDragOverFolder(null);
  };

  const dragProps = (name, node, isFolder) => ({
    // Returns drag event handlers for a file/folder row
    draggable: true,
    onDragStart: () => setDraggedItem({ name, node, isFolder }),
    onDragEnd: () => { setDraggedItem(null); setDragOverFolder(null); },
    ...(isFolder && {
      onDragOver: e => { e.preventDefault(); setDragOverFolder(name); },
      onDragLeave: () => setDragOverFolder(null),
      onDrop: () => handleDrop(name),
    }),
  });

  // Paths of folders being moved — excluded from the tree so you can't move a folder into itself or its descendants
  const moveExcludePaths = moveModal ? new Set(
    moveModal.items
      .filter(i => i.isFolder)
      .flatMap(i => {
        const p = [...currentPath, i.name].join('/');
        return [p, ...Object.keys(fileIds).filter(k => k.startsWith(p + '/'))];
      })
  ) : null;

  return (
    <div className="file-view" onClick={() => setContextMenu(null)}>

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
      </div>

      {/* Selection bar — visible when one or more items are selected */}
      {selectedItems.size > 0 && (
        <div className="fv-selection-bar">
          <span className="fv-sel-count">{selectedItems.size} selected</span>
          <button className="fv-sel-btn fv-sel-danger" onClick={() => setBatchDeleteModal(true)}>
            <span className="material-icons">delete_outline</span>Delete
          </button>
          <button className="fv-sel-btn" onClick={() => startMove([...selectedItems].map(n => ({ name: n, node: currentDir[n], isFolder: currentDir[n] !== null && typeof currentDir[n] === 'object' })))}>
            <span className="material-icons">drive_file_move_outline</span>Move
          </button>
          <span className="fv-sel-hint">Drag any selected item to move all</span>
          <button className="fv-sel-clear" onClick={() => setSelectedItems(new Set())} title="Clear selection">
            <span className="material-icons">close</span>
          </button>
        </div>
      )}

      {/* File contents */}
      {viewMode === 'shelf' ? (
        <ShelfView
          sortedEntries={sortedEntries}
          filteredEntries={filteredEntries}
          search={search}
          dragOverFolder={dragOverFolder}
          openFolder={openFolder}
          openContextMenu={openContextMenu}
          dragProps={dragProps}
          getFileIcon={getFileIcon}
          selectedItems={selectedItems}
          toggleSelect={toggleSelect}
          onMoveStart={startMove}
        />
      ) : (
        <LedgerView
          sortedEntries={sortedEntries}
          filteredEntries={filteredEntries}
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
              <FolderTree tree={tree} onSelect={handleMoveSubmit} excludePaths={moveExcludePaths} />
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
