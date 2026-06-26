// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
import { useAccountContext } from './AccountContext.jsx';
import { useAuthContext } from './AuthContext.jsx';
import axios from "axios";

const FileContext = createContext();

export const useFileContext = () => useContext(FileContext);

export const FileProvider = ({children}) => {
    const { userId } = useAccountContext();
    const { isLoggedIn } = useAuthContext();
    const [folderCache, setFolderCache] = useState({}); // path → items[]  (empty string = root)
    const [loadingSet, setLoadingSet] = useState(() => new Set()); // paths currently being fetched
    const [currentPath, setCurrentPath] = useState([]); // active folder path segments
    const [uploads, setUploads] = useState([]); // in-flight uploads: { name, progress, status, error }
    const [storageReady, setStorageReady] = useState(null); // null = unknown, false = not configured, true = ready

    const pendingFetches = useRef(new Set()); // prevents duplicate in-flight requests for the same path
    const cacheRef = useRef({}); // synchronous mirror of folderCache for non-stale closure checks

    const loadFolder = useCallback((folderPath) => {
        // Fetches direct children of folderPath and stores them in the cache; no-ops if already loading or cached
        if (pendingFetches.current.has(folderPath) || cacheRef.current[folderPath] !== undefined) return;
        if (!userId || !isLoggedIn) return;
        pendingFetches.current.add(folderPath);
        setLoadingSet(prev => new Set(prev).add(folderPath));
        axios.get(`/api/files/name/${userId}`, { params: { folder: folderPath } })
            .then(res => {
                const initialized = res.data.initialized !== false;
                if (folderPath === '') setStorageReady(initialized); // root load tells us if storage is configured
                const items = initialized ? (res.data.items ?? []) : [];
                cacheRef.current = { ...cacheRef.current, [folderPath]: items };
                setFolderCache({ ...cacheRef.current });
            })
            .catch(err => console.error('[/api/files/name]', folderPath, err.response?.status ?? err.code, err.response?.data || err.message))
            .finally(() => {
                pendingFetches.current.delete(folderPath);
                setLoadingSet(prev => { const s = new Set(prev); s.delete(folderPath); return s; });
            });
    }, [userId, isLoggedIn]);

    const invalidateFolder = useCallback((folderPath) => {
        // Removes folderPath from cache so the next loadFolder call re-fetches it
        delete cacheRef.current[folderPath];
        setFolderCache({ ...cacheRef.current });
    }, []);

    const refreshFiles = useCallback(() => {
        // Clears the entire cache and reloads from root — used after storage path changes
        cacheRef.current = {};
        setFolderCache({});
        pendingFetches.current.clear();
        loadFolder('');
    }, [loadFolder]);

    useEffect(() => {
        if (userId && isLoggedIn) loadFolder('');
    }, [userId, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Streams each file to the current folder, then invalidates and reloads that folder
        if (!userId) return;
        const files = Array.from(fileList);
        if (files.length === 0) return;
        const location = currentPath.join('/');
        setUploads(files.map(f => ({ name: f.name, progress: 0, status: 'uploading' })));
        await Promise.allSettled(files.map((file, i) =>
            axios.post(`/api/files/upload/${userId}`, file, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    file_name: file.name.replace(/[^\x20-\x7E]/g, '_'),
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
        invalidateFolder(location);
        loadFolder(location);
    }, [userId, currentPath, invalidateFolder, loadFolder]);

    const clearUploads = useCallback(() => setUploads([]), []);

    const filesLoading = loadingSet.has(currentPath.join('/')); // true when the currently viewed folder is being fetched

    return (
        <FileContext.Provider value={{ folderCache, loadFolder, invalidateFolder, refreshFiles, currentPath, setCurrentPath, uploadFiles, uploads, clearUploads, storageReady, filesLoading }}>
            {children}
        </FileContext.Provider>
    );
};
