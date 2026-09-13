import { createContext, useEffect, useState } from 'react';
import axios from '../config/axios';
import { disconnectSocket } from '../config/socket';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const restoreSession = async () => {
            try {
                const response = await axios.post('/users/refresh');
                if (mounted) setUser(response.data.user);
            } catch {
                if (mounted) setUser(null);
            } finally {
                if (mounted) setAuthLoading(false);
            }
        };

        restoreSession();

        const handleAuthExpired = () => {
            if (mounted) setUser(null);
        };

        window.addEventListener('auth:expired', handleAuthExpired);

        return () => {
            mounted = false;
            window.removeEventListener('auth:expired', handleAuthExpired);
        };
    }, []);

    const logout = async () => {
        try {
            await axios.post('/users/logout');
        } catch {
            // The server-side session may already be expired or revoked.
        } finally {
            disconnectSocket();
            setUser(null);
        }
    };

    return (
        <UserContext.Provider value={{ user, setUser, logout, authLoading }}>
            {children}
        </UserContext.Provider>
    );
};
