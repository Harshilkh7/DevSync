import userModel from '../models/user.model.js';

export const createUser = async ({ email, password }) => {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
        throw new Error('Email and password are required');
    }

    const hashedPassword = await userModel.hashPassword(password);

    return await userModel.create({
        email: normalizedEmail,
        password: hashedPassword
    });
};

export const getAllUsers = async ({ userId }) => {
    return await userModel.find({
        _id: { $ne: userId }
    });
};
