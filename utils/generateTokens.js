const jwt = require('jsonwebtoken');

const generateAccessToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

module.exports = { generateAccessToken, generateRefreshToken };
