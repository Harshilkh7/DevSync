import jwt from 'jsonwebtoken';
import redisClient from '../services/redis.service.js';

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

const getCookie = (cookieHeader, name) => {
    if (!cookieHeader) return null;
    const pair = cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.trim().slice(name.length + 1)) : null;
};

export const getAccessTokenFromRequest = (req) => {
    return req.cookies?.accessToken ||
        getCookie(req.headers.cookie, 'accessToken') ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : null);
};

export const authUser = async (req, res, next) => {
    try {
        const token = getAccessTokenFromRequest(req);

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized User: Access token missing' });
        }

        const isBlacklisted = await redisClient.get(`access:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ error: 'Unauthorized User: Access token revoked' });
        }

        const decoded = jwt.verify(token, getAccessSecret());

        if (decoded.type !== 'access' || !decoded.userId) {
            return res.status(401).json({ error: 'Invalid access token' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid or malformed access token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Access token expired' });
        }

        console.error('Authentication failed:', error.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
