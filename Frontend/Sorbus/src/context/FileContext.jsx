// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { createContext, useState, useContext, useEffect, useCallback } from "react";
import { useAccountContext } from './AccountContext.jsx';
import { useAuthContext } from './AuthContext.jsx';
import axios from "axios";

const FileContext = createContext();

export const useFileContext = () => useContext(FileContext);

export const FileProvider = ({children}) => {
    const { userId } = useAccountContext();
    const { isLoggedIn } = useAuthContext();
    const [tree, setTree] = useState({}); //For the tree of file ids
    const [fileIds, setFileIds] = useState({}); //Maps full path → DB id (files and folders)
    const [fileInfo, setFileInfo] = useState({}); //Maps full path → { size, isFolder, ext, created }
    const [currentPath, setCurrentPath] = useState([]); //For the current path for which the homepage displays
    const [uploads, setUploads] = useState([]); //Tracks in-flight uploads: { name, progress, status, error }
    const [storageReady, setStorageReady] = useState(null); //null = unknown (still loading), false = not configured, true = ready
    const [filesLoading, setFilesLoading] = useState(false); //True while the file tree is being fetched

    const refreshFiles = useCallback(() => {
        // Fetches the full file tree for the logged-in user — call this after upload/delete/rename
        if (!userId || !isLoggedIn) return; //Guard: wait for both userId and a confirmed session before firing
        setFilesLoading(true);
        axios.get(`/api/files/name/${userId}`)
            .then(res => {
                const initialized = res.data.initialized !== false;
                setStorageReady(initialized);
                setTree(initialized ? res.data.tree : {});
                setFileIds(initialized ? res.data.fileIds : {});
                setFileInfo(initialized ? (res.data.fileInfo ?? {}) : {});
            })
            .catch(err => console.error('[/api/files/name]', err.response?.status ?? err.code, err.response?.data || err.message))
            .finally(() => setFilesLoading(false));
    }, [userId, isLoggedIn]);

    useEffect(() => {
        refreshFiles();
    }, [refreshFiles]);

    const uploadErrorMessage = (err) => {
        // Maps an upload failure to a short user-facing message
        switch (err.response?.status) {
            case 409: return 'Already exists';
            case 403: return 'No upload permission';
            case 507: return 'Not enough space';
            default: return 'Upload failed';
        }
    };

    const uploadFiles = useCallback(async (fileList) => {
        // Streams each file straight to the gateway (no in-memory buffering) into the current folder, then refreshes the tree
        if (!userId) return;
        const files = Array.from(fileList);
        if (files.length === 0) return;
        const location = currentPath.join('/'); //The folder currently being viewed receives the uploads
        setUploads(files.map(f => ({ name: f.name, progress: 0, status: 'uploading' })));
        await Promise.allSettled(files.map((file, i) =>
            axios.post(`/api/files/upload/${userId}`, file, {
                headers: {
                    'Content-Type': 'application/octet-stream', //Raw body so the C++ server writes the bytes straight to disk
                    file_name: file.name.replace(/[^\x20-\x7E]/g, '_'), //Replaces non-ASCII chars so the name is valid in an HTTP header (no decode needed server-side)
                    file_location: location,
                },
                onUploadProgress: (e) => {
                    const progress = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
                    setUploads(prev => prev.map((u, j) => j === i ? { ...u, progress } : u));
                },
            })
                .then(() => setUploads(prev => prev.map((u, j) => j === i ? { ...u, progress: 100, status: 'done' } : u)))
                .catch(err => setUploads(prev => prev.map((u, j) => j === i ? { ...u, status: 'error', error: uploadErrorMessage(err) } : u)))
        ));
        refreshFiles(); //Refresh once the batch settles so the tree and storage bar reflect the new files
    }, [userId, currentPath, refreshFiles]);

    const clearUploads = useCallback(() => setUploads([]), []); //Clears the upload progress list (memoized so the toast's auto-dismiss timer stays stable)

    return (
        <FileContext.Provider value={{ tree, fileIds, fileInfo, currentPath, setCurrentPath, refreshFiles, uploadFiles, uploads, clearUploads, storageReady, filesLoading }}>
            {children}
        </FileContext.Provider>
    );
};