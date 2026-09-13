import userModel from '../models/user.model.js';
import * as userService from '../services/user.service.js';
import { validationResult } from 'express-validator';
import {
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
    createTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
    blacklistAccessToken,
} from '../services/token.service.js';

const isProduction = process.env.NODE_ENV === 'production';

const accessCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: '/',
};

const refreshCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: '/users',
};

const clearCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
};

const setAuthCookies = (res, accessToken, refreshToken) => {
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
};

const sanitizeUser = (user) => {
    const userObject = user.toObject ? user.toObject() : { ...user };
    delete userObject.password;
    return userObject;
};

export const createUserController = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password;
        const user = await userService.createUser({ email, password });
        const { accessToken, refreshToken } = await createTokenPair(user, req);

        setAuthCookies(res, accessToken, refreshToken);

        return res.status(201).json({ user: sanitizeUser(user) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: 'User already exists',
                errors: [{ msg: 'An account with this email already exists. Please sign in.' }]
            });
        }

        console.error('Registration failed:', error);
        return res.status(400).json({ message: error.message || 'Registration failed' });
    }
};

export const loginController = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const email = req.body.email.trim().toLowerCase();
        const { password } = req.body;
        const user = await userModel.findOne({ email }).select('+password');

        if (!user || !(await user.isValidPassword(password))) {
            return res.status(401).json({
                errors: 'Invalid credentials',
                message: 'Invalid email or password'
            });
        }

        const { accessToken, refreshToken } = await createTokenPair(user, req);
        setAuthCookies(res, accessToken, refreshToken);

        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (err) {
        console.error('Login failed:', err);
        return res.status(500).json({ message: 'Login failed. Please try again.' });
    }
};

export const refreshController = async (req, res) => {
    try {
        const refreshToken = req.cookies[REFRESH_COOKIE];
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token missing' });
        }

        const { accessToken, refreshToken: rotatedRefreshToken } = await rotateRefreshToken(refreshToken, req);
        const decoded = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
        const user = await userModel.findById(decoded.userId);

        if (!user) {
            await revokeRefreshToken(refreshToken);
            return res.status(401).json({ message: 'User not found' });
        }

        setAuthCookies(res, accessToken, rotatedRefreshToken);
        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
        res.clearCookie(ACCESS_COOKIE, clearCookieOptions);
        res.clearCookie(REFRESH_COOKIE, { ...clearCookieOptions, path: '/users' });
        return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
};

export const profileController = async (req, res) => {
    const user = await userModel.findOne({ email: req.user.email });
    if (!user) return res.status(401).json({ message: 'User not found' });

    return res.status(200).json({ user: sanitizeUser(user) });
};

export const logoutController = async (req, res) => {
    try {
        const refreshToken = req.cookies[REFRESH_COOKIE];
        const accessToken = req.cookies[ACCESS_COOKIE];

        await revokeRefreshToken(refreshToken);
        await blacklistAccessToken(accessToken);

        res.clearCookie(ACCESS_COOKIE, clearCookieOptions);
        res.clearCookie(REFRESH_COOKIE, { ...clearCookieOptions, path: '/users' });

        return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Unable to log out' });
    }
};

export const getAllUsersController = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const allUsers = await userService.getAllUsers({ userId: loggedInUser._id });

        return res.status(200).json({ users: allUsers });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};
