import { useState } from 'react';
import '../styles/SideBar.css';

function FolderTreeNode({ name, node, depth, parentPath, onSelect, excludePaths }) {
  // Renders one expandable folder; recursively renders child folders when expanded
  const [expanded, setExpanded] = useState(false);
  const isFolder = node !== null && typeof node === 'object';
  const fullPath = [...parentPath, name];
  const pathStr = fullPath.join('/');

  if (!isFolder || excludePaths?.has(pathStr)) return null;

  const childFolders = Object.entries(node).filter(([, child]) => child !== null && typeof child === 'object');

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
      </div>
      {expanded && childFolders.map(([childName, childNode]) => (
        <FolderTreeNode
          key={childName}
          name={childName}
          node={childNode}
          depth={depth + 1}
          parentPath={fullPath}
          onSelect={onSelect}
          excludePaths={excludePaths}
        />
      ))}
    </div>
  );
}

function FolderTree({ tree, onSelect, excludePaths }) {
  // Renders the full folder tree; onSelect receives the clicked folder's path as a string
  return (
    <div>
      {Object.entries(tree).map(([name, node]) => (
        <FolderTreeNode
          key={name}
          name={name}
          node={node}
          depth={0}
          parentPath={[]}
          onSelect={onSelect}
          excludePaths={excludePaths}
        />
      ))}
    </div>
  );
}

export default FolderTree;
