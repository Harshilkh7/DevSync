import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minLength: [ 6, 'Email must be at least 6 characters long' ],
        maxLength: [ 50, 'Email must not be longer than 50 characters' ]
    },
    password: {
        type: String,
        select: false,
    }
});

userSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
};

userSchema.methods.isValidPassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET;

userSchema.methods.generateAccessToken = function () {
    const secret = getAccessSecret();
    if (!secret) throw new Error('JWT access secret is not configured');

    return jwt.sign(
        { userId: this._id.toString(), email: this.email, type: 'access' },
        secret,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' }
    );
};

userSchema.methods.generateRefreshToken = function (jti) {
    const secret = getRefreshSecret();
    if (!secret) throw new Error('JWT refresh secret is not configured');

    return jwt.sign(
        { userId: this._id.toString(), type: 'refresh', jti },
        secret,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );
};

// Kept for compatibility with any code that still imports generateJWT.
userSchema.methods.generateJWT = function () {
    return this.generateAccessToken();
};

const User = mongoose.model('user', userSchema);

export default User;
