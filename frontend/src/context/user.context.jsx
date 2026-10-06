import { createContext, useEffect, useRef, useState } from 'react';
import axios from '../config/axios';
import { disconnectSocket } from '../config/socket';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUserState] = useState(null);
    const userRef = useRef(null);
    const [authLoading, setAuthLoading] = useState(true);

    const setUser = (nextUser) => {
        userRef.current = typeof nextUser === 'function'
            ? nextUser(userRef.current)
            : nextUser;
        setUserState(userRef.current);
    };

    useEffect(() => {
        let mounted = true;

        const restoreSession = async () => {
            try {
                const response = await axios.post('/users/refresh');
                if (mounted && !userRef.current) setUser(response.data.user);
            } catch {
                // Do not let a stale startup refresh clear a user who has just logged in.
                if (mounted && !userRef.current) setUser(null);
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
