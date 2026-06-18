import { useState } from 'react';
import { useFileContext } from '../context/FileContext.jsx';
import FileItemActions from './FileItemActions.jsx';

function formatSize(bytes) {
  // Converts raw bytes to a human-readable string
  if (bytes == null || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function LedgerView({ sortedEntries, filteredEntries, search, dragOverFolder, openFolder, openContextMenu, dragProps, sortField, sortDir, handleSort, getFileIcon, selectedItems, toggleSelect, onMoveStart }) {
  // Table-style list view with sortable columns for name, type, and size
  const { fileInfo, currentPath } = useFileContext();
  const [renamingItem, setRenamingItem] = useState(null); // { name, onSubmit }
  const [renameValue, setRenameValue] = useState('');

  const onRenameStart = (name, onSubmit) => {
    // Switches the named row into inline edit mode
    setRenamingItem({ name, onSubmit });
    setRenameValue(name);
  };

  const submitRename = async () => {
    if (!renamingItem) return;
    await renamingItem.onSubmit(renameValue);
    setRenamingItem(null);
  };

  const getItemSize = (name, node) => {
    // Returns raw bytes for a file, or the recursive total of all files inside a folder
    if (typeof node === 'string') return fileInfo[node]?.size ?? -1;
    const prefix = [...currentPath, name].join('/') + '/';
    return Object.entries(fileInfo).reduce((sum, [path, info]) => {
      return (path.startsWith(prefix) && !info.isFolder && info.size >= 0) ? sum + info.size : sum;
    }, 0);
  };

  return (
    <div className="fv-ledger">
      <div className="fv-ledger-header">
        <span />
        <button className={`fv-sort-btn ${sortField === 'name' ? 'active' : ''}`} onClick={() => handleSort('name')}>
          Name {sortField === 'name' && <span className="material-icons">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
        </button>
        <button className={`fv-sort-btn ${sortField === 'type' ? 'active' : ''}`} onClick={() => handleSort('type')}>
          Type {sortField === 'type' && <span className="material-icons">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
        </button>
        <button className={`fv-sort-btn ${sortField === 'size' ? 'active' : ''}`} onClick={() => handleSort('size')}>
          Size {sortField === 'size' && <span className="material-icons">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
        </button>
        <span />
      </div>
      {sortedEntries.map(([name, node]) => {
        const isFolder = node !== null && typeof node === 'object';
        const isSelected = selectedItems.has(name);
        const isRenaming = renamingItem?.name === name;
        return (
          <div
            key={name}
            className={`fv-row ${isFolder ? 'fv-folder-row' : 'fv-file-row'} ${dragOverFolder === name ? 'fv-drop-target' : ''} ${isSelected ? 'fv-selected' : ''}`}
            onDoubleClick={isFolder && !isRenaming ? () => openFolder(name) : undefined}
            onContextMenu={e => openContextMenu(e, name, node)}
            {...(isRenaming ? {} : dragProps(name, node, isFolder))}
          >
            <input
              type="checkbox"
              className="fv-checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(name)}
              onClick={e => e.stopPropagation()}
            />
            <div className="fv-row-name-cell">
              <span className={`material-icons fv-row-icon ${isFolder ? '' : 'fv-file-icon'}`}>
                {isFolder ? 'folder' : getFileIcon(name)}
              </span>
              <div className="fv-row-name-group">
                {isRenaming ? (
                  <input
                    autoFocus
                    className="fv-inline-rename"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingItem(null); }}
                    onBlur={submitRename}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="fv-row-name">{name}</span>
                    <span className="fv-row-meta">
                      {isFolder ? 'Folder' : (fileInfo[node]?.ext ? fileInfo[node].ext.toUpperCase() : '—')}
                      {' · '}
                      {formatSize(getItemSize(name, node))}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="fv-row-type">{isFolder ? 'Folder' : (fileInfo[node]?.ext ? fileInfo[node].ext.toUpperCase() : '—')}</span>
            <span className="fv-row-size">{formatSize(getItemSize(name, node))}</span>
            <FileItemActions name={name} node={node} isFolder={isFolder} openFolder={openFolder} onRenameStart={onRenameStart} onMoveStart={onMoveStart} />
          </div>
        );
      })}
      {filteredEntries.length === 0 && (
        <p className="fv-empty">{search ? 'No results match your search.' : 'This folder is empty.'}</p>
      )}
    </div>
  );
}

export default LedgerView;
