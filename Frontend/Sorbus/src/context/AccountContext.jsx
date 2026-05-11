import { createContext, useState, useContext } from "react";
import axios from "axios";

const AccountContext = createContext();

export const useAccountContext = () => useContext(AccountContext);

export const AccountProvider = ({children}) => {
    const [userId, setUserId] = useState(null);
    const [username, setUsername] = useState(null);
    const [access, setAccess] = useState(null); // "owner" | "editor" | "viewer"
    const [serverPath, setServerPath] = useState(null); // FILE_LOCATION on the C++ server

    const refreshServerPath = () => {
        // Fetches the current server storage path
        axios.get(`/api/features/location`)
            .then(res => setServerPath(res.data.location))
            .catch(err => console.error('Failed to fetch server path:', err));
    };

    return (
        <AccountContext.Provider value={{ userId, setUserId, username, setUsername, access, setAccess, serverPath, setServerPath, refreshServerPath }}>
            {children}
        </AccountContext.Provider>
    );
};