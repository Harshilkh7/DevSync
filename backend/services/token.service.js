import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import RefreshSession from '../models/refreshSession.model.js';
import userModel from '../models/user.model.js';
import redisClient from './redis.service.js';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const hashJti = (jti) => crypto.createHash('sha256').update(jti).digest('hex');
const getRefreshSecret = () => {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT refresh secret is not configured');
    return secret;
};

export const createTokenPair = async (user, req) => {
    const jti = crypto.randomUUID();
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken(jti);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await RefreshSession.create({
        userId: user._id,
        jtiHash: hashJti(jti),
        expiresAt,
        userAgent: req.get('user-agent') || '',
    });

    await redisClient.set(`refresh:${jti}`, user._id.toString(), 'EX', REFRESH_TOKEN_TTL_SECONDS);
    return { accessToken, refreshToken };
};

export const rotateRefreshToken = async (refreshToken, req) => {
    const decoded = jwt.verify(refreshToken, getRefreshSecret());
    if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) throw new Error('Invalid refresh token');

    // GETDEL makes a refresh token single-use even if two refresh requests arrive together.
    const redisUserId = await redisClient.getdel(`refresh:${decoded.jti}`);
    if (!redisUserId || redisUserId !== decoded.userId) throw new Error('Refresh session revoked or expired');

    const oldSession = await RefreshSession.findOne({
        userId: decoded.userId,
        jtiHash: hashJti(decoded.jti),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    });

    if (!oldSession) throw new Error('Refresh session revoked or expired');

    const user = await userModel.findById(decoded.userId);
    if (!user) {
        await oldSession.updateOne({ revokedAt: new Date() });
        throw new Error('User not found');
    }

    await oldSession.updateOne({ revokedAt: new Date() });
    return createTokenPair(user, req);
};

export const revokeRefreshToken = async (refreshToken) => {
    if (!refreshToken) return;

    try {
        const decoded = jwt.verify(refreshToken, getRefreshSecret(), { ignoreExpiration: true });
        if (decoded.jti) {
            await RefreshSession.updateOne(
                { jtiHash: hashJti(decoded.jti), revokedAt: null },
                { revokedAt: new Date() }
            );
            await redisClient.del(`refresh:${decoded.jti}`);
        }
    } catch {
        // Cookie is cleared by the controller even when the token is invalid.
    }
};

export const blacklistAccessToken = async (accessToken) => {
    if (!accessToken) return;

    try {
        const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(accessToken, secret, { ignoreExpiration: true });
        const remainingSeconds = Math.max(1, Math.ceil((decoded.exp * 1000 - Date.now()) / 1000));
        await redisClient.set(`access:${accessToken}`, 'logout', 'EX', remainingSeconds);
    } catch {
        // The access token is already invalid/expired, so there is nothing to revoke.
    }
};
