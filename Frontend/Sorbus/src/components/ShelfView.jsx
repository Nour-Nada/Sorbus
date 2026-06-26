// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState } from 'react';
import FileItemActions from './FileItemActions.jsx';

function ShelfView({ sortedItems, filteredItems, search, dragOverFolder, openFolder, openContextMenu, dragProps, getFileIcon, selectedItems, toggleSelect, onMoveStart, creatingFolder, newFolderName, setNewFolderName, onCreateFolder }) {
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
      {sortedItems.map(item => {
        const isSelected = selectedItems.has(item.name);
        const isRenaming = renamingItem?.name === item.name;
        return (
          <div
            key={item.name}
            className={`fv-card ${item.isFolder ? 'fv-folder-card' : 'fv-file-card'} ${dragOverFolder === item.name ? 'fv-drop-target' : ''} ${isSelected ? 'fv-selected' : ''}`}
            onDoubleClick={item.isFolder && !isRenaming ? () => openFolder(item.name) : undefined}
            onContextMenu={e => openContextMenu(e, item)}
            {...(isRenaming ? {} : dragProps(item))}
          >
            <input
              type="checkbox"
              className="fv-checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(item.name)}
              onClick={e => e.stopPropagation()}
            />
            <span className={`material-icons fv-card-icon ${item.isFolder ? '' : 'fv-file-icon'}`}>
              {item.isFolder ? 'folder' : getFileIcon(item.name)}
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
              <span className="fv-card-name">{item.name}</span>
            )}
            <FileItemActions item={item} openFolder={openFolder} onRenameStart={onRenameStart} onMoveStart={onMoveStart} />
          </div>
        );
      })}
      {filteredItems.length === 0 && (
        <p className="fv-empty">{search ? 'No results match your search.' : 'This folder is empty.'}</p>
      )}
    </div>
  );
}

export default ShelfView;
