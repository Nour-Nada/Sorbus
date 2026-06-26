// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { useState, useEffect } from 'react';
import { useFileContext } from '../context/FileContext.jsx';
import '../styles/SideBar.css';

function FolderTreeNode({ name, pathStr, depth, onSelect, excludePaths }) {
    // Renders one expandable folder node; fetches children from the cache on first expand
    const { folderCache, loadFolder } = useFileContext();
    const [expanded, setExpanded] = useState(false);

    const children = folderCache[pathStr]; // undefined = not yet loaded
    const isLoading = expanded && children === undefined;

    useEffect(() => {
        // Trigger a fetch the first time this node is expanded (or after its cache entry is invalidated)
        if (expanded && children === undefined) loadFolder(pathStr);
    }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

    if (excludePaths?.has(pathStr)) return null;

    const childFolders = children ? children.filter(i => i.isFolder) : [];

    return (
        <div>
            <div className="tree-item-row" style={{ paddingLeft: `${8 + depth * 16}px` }}>
                <button className="tree-arrow-btn" onClick={() => setExpanded(e => !e)}>
                    <span className="material-icons tree-arrow">
                        {expanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
                    </span>
                </button>
                <button className="tree-name-btn" onClick={() => onSelect(pathStr)}>
                    <span className="material-icons tree-icon">folder</span>
                    <span className="tree-label">{name}</span>
                </button>
                {isLoading && <span className="tree-spinner" />}
            </div>
            {expanded && childFolders.map(child => (
                <FolderTreeNode
                    key={child.name}
                    name={child.name}
                    pathStr={pathStr ? `${pathStr}/${child.name}` : child.name}
                    depth={depth + 1}
                    onSelect={onSelect}
                    excludePaths={excludePaths}
                />
            ))}
        </div>
    );
}

function FolderTree({ onSelect, excludePaths }) {
    // Renders the root-level folder list; each node lazily loads its children on expand
    const { folderCache } = useFileContext();
    const rootFolders = (folderCache[''] ?? []).filter(i => i.isFolder);

    return (
        <div>
            {rootFolders.map(item => (
                <FolderTreeNode
                    key={item.name}
                    name={item.name}
                    pathStr={item.name}
                    depth={0}
                    onSelect={onSelect}
                    excludePaths={excludePaths}
                />
            ))}
        </div>
    );
}

export default FolderTree;
