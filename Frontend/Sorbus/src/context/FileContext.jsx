import { createContext, useState, useContext, useEffect } from "react";
import axios from "axios";

const FileContext = createContext();

export const useFileContext = () => useContext(FileContext);

export const FileProvider = ({children}) => {
    const [tree, setTree] = useState({}); //For the tree of file ids
    const [fileIds, setFileIds] = useState({}); //For the main file information
    const [currentPath, setCurrentPath] = useState([]); //For the current path for which the homepage displays

    const refreshFiles = () => {
        // Fetches the full file tree for the logged-in user
        const userId = localStorage.getItem('user_id');
        axios.get(`/api/files/name/${userId}`)
            .then(res => {
                setTree(res.data.tree);
                setFileIds(res.data.fileIds);
            })
            .catch(err => console.error('Failed to fetch files:', err));
    };

    useEffect(() => {
        refreshFiles();
    }, []);

    return (
        <FileContext.Provider value={{ tree, fileIds, currentPath, setCurrentPath, refreshFiles }}>
            {children}
        </FileContext.Provider>
    );
};