import { useState } from 'react';
import FileItemActions from './FileItemActions.jsx';

function ShelfView({ sortedEntries, filteredEntries, search, dragOverFolder, openFolder, openContextMenu, dragProps, getFileIcon, selectedItems, toggleSelect, onMoveStart, creatingFolder, newFolderName, setNewFolderName, onCreateFolder }) {
  // Grid of file/folder cards for the shelf view
  const [renamingItem, setRenamingItem] = useState(null); // { name, onSubmit }
  const [renameValue, setRenameValue] = useState('');

  const onRenameStart = (name, onSubmit) => {
    // Switches the named card into inline edit mode
    setRenamingItem({ name, onSubmit });
    setRenameValue(name);
  };

  const submitRename = async () => {
    if (!renamingItem) return;
    await renamingItem.onSubmit(renameValue);
    setRenamingItem(null);
  };

  return (
    <div className="fv-shelf">
      {creatingFolder && (
        <div className="fv-card fv-folder-card">
          <span className="material-icons fv-card-icon">folder</span>
          <input
            autoFocus
            className="fv-inline-rename"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onCreateFolder(newFolderName); if (e.key === 'Escape') onCreateFolder(''); }}
            onBlur={() => onCreateFolder(newFolderName)}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      {sortedEntries.map(([name, node]) => {
        const isFolder = node !== null && typeof node === 'object';
        const isSelected = selectedItems.has(name);
        const isRenaming = renamingItem?.name === name;
        return (
          <div
            key={name}
            className={`fv-card ${isFolder ? 'fv-folder-card' : 'fv-file-card'} ${dragOverFolder === name ? 'fv-drop-target' : ''} ${isSelected ? 'fv-selected' : ''}`}
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
            <span className={`material-icons fv-card-icon ${isFolder ? '' : 'fv-file-icon'}`}>
              {isFolder ? 'folder' : getFileIcon(name)}
            </span>
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
              <span className="fv-card-name">{name}</span>
            )}
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

export default ShelfView;
