require('dotenv').config();
const createApp = require("./createApp");
const { PORT } = require("./config");
const { closeDatabase } = require("./utils/database");

createApp()
    .then((app) => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Failed to start server:", err);
    });

process.on("SIGINT", async () => {
    await closeDatabase();
    console.log("MongoDB connection closed");
    process.exit(0);
});