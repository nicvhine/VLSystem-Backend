module.exports = {
    PORT: process.env.PORT || 3001,
    MONGODB_URI: process.env.MONGODB_URI,
    CORS_OPTIONS: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    },
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3001',
};
