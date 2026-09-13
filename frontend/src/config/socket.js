import socket from 'socket.io-client';

let socketInstance = null;

const socketOptions = (projectId) => ({
    withCredentials: true,
    ...(projectId ? { query: { projectId } } : {}),
});

export const initializeSocket = (projectId) => {
    if (socketInstance) socketInstance.disconnect();

    socketInstance = socket(import.meta.env.VITE_API_URL, socketOptions(projectId));
    return socketInstance;
};

export const initializeUserSocket = () => {
    if (socketInstance) socketInstance.disconnect();

    socketInstance = socket(import.meta.env.VITE_API_URL, socketOptions());
    return socketInstance;
};

export const receiveMessage = (eventName, cb) => {
    socketInstance?.on(eventName, cb);
};

export const sendMessage = (eventName, data) => {
    socketInstance?.emit(eventName, data);
};

export const removeMessageListener = (eventName, cb) => {
    socketInstance?.off(eventName, cb);
};

export const disconnectSocket = () => {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
};
