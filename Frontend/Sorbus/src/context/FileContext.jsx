import { createContext, useState, useContext, useEffect, useCallback } from "react";
import { useAccountContext } from './AccountContext.jsx';
import axios from "axios";

const FileContext = createContext();

export const useFileContext = () => useContext(FileContext);

export const FileProvider = ({children}) => {
    const { userId } = useAccountContext();
    const [tree, setTree] = useState({}); //For the tree of file ids
    const [fileIds, setFileIds] = useState({}); //For the main file information
    const [currentPath, setCurrentPath] = useState([]); //For the current path for which the homepage displays

    const refreshFiles = useCallback(() => {
        // Fetches the full file tree for the logged-in user — call this after upload/delete/rename
        if (!userId) return;
        axios.get(`/api/files/name/${userId}`)
            .then(res => {
                setTree(res.data.tree);
                setFileIds(res.data.fileIds);
            })
            .catch(err => console.error('Failed to fetch files:', err));
    }, [userId]);

    useEffect(() => {
        refreshFiles();
    }, [refreshFiles]);

    return (
        <FileContext.Provider value={{ tree, fileIds, currentPath, setCurrentPath, refreshFiles }}>
            {children}
        </FileContext.Provider>
    );
};