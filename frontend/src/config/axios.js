import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL;

const axiosInstance = axios.create({
    baseURL,
    withCredentials: true,
});

const refreshClient = axios.create({
    baseURL,
    withCredentials: true,
});

let refreshPromise = null;

const refreshSession = async () => {
    if (!refreshPromise) {
        refreshPromise = refreshClient.post('/users/refresh')
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        const requestUrl = originalRequest?.url || '';
        const isAuthEndpoint = ['/users/login', '/users/register', '/users/refresh', '/users/logout']
            .some((path) => requestUrl.includes(path));

        if (status !== 401 || !originalRequest || originalRequest._retry || isAuthEndpoint) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            await refreshSession();
            return axiosInstance(originalRequest);
        } catch (refreshError) {
            window.dispatchEvent(new Event('auth:expired'));
            return Promise.reject(refreshError);
        }
    }
);

export default axiosInstance;
