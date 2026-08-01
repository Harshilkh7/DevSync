import jwt from "jsonwebtoken";
import redisClient from "../services/redis.service.js";

export const authUser = async (req, res, next) => {
    try {
        const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

        if (!token) {
            return res.status(401).send({ error: 'Unauthorized User: Token Missing' });
        }

        // Check if the token is blacklisted
        const isBlackListed = await redisClient.get(token).catch(( err) => {
            console.error('Redis unavailable:', err.message);
            throw new Error('Redis unavailable');
        });

        if (isBlackListed) {
            res.cookie('token', '', { httpOnly: true, maxAge: 0 }); // Clear the cookie
            return res.status(401).send({ error: 'Unauthorized User: Token Blacklisted' });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded user info to the request
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).send({ error: 'Invalid or Malformed Token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).send({ error: 'Token Expired' });
        }
        console.error('Authentication failed:', error.message);
        return res.status(500).send({ error: 'Internal Server Error' });
    }
};