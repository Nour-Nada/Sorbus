// ============================================================
//   ___  ___  ____  ____  _   _  ___
//  / __)/ _ \(  _ \(  _ )/ ) ( \/ __)
//  \__ \ (_) ))   / ) _ (\ \/ / \__ \
//  (___/\___/(_)\_)(____/ \__/  (___/
//
// Self-Hosted Personal Cloud Storage — MIT License
// ============================================================
import { createContext, useState, useContext } from "react";
import axios from "axios";

const AccountContext = createContext();

export const useAccountContext = () => useContext(AccountContext);

export const AccountProvider = ({children}) => {
    const [userId, setUserId] = useState(null);
    const [username, setUsername] = useState(null);
    const [access, setAccess] = useState(null); // "owner" | "editor" | "viewer"
    const [serverPath, setServerPath] = useState(null); // FILE_LOCATION on the C++ server

    const updateUserId = (id) => {
        // Sets userId in state; sourced from the refresh token so localStorage is not needed
        setUserId(id);
    };

    const refreshServerPath = () => {
        // Fetches the current server storage path
        axios.get(`/api/features/location`)
            .then(res => setServerPath(res.data))
            .catch(err => console.error('Failed to fetch server path:', err));
    };

    return (
        <AccountContext.Provider value={{ userId, updateUserId, username, setUsername, access, setAccess, serverPath, setServerPath, refreshServerPath }}>
            {children}
        </AccountContext.Provider>
    );
};