const { connectToDatabase } = require('./utils/database');
const loadRoutes = require('./loadRoutes');
const loadCounters = require("./loadCounters");

async function initialize(app) {
    const db = await connectToDatabase();
    await loadCounters(db);
    loadRoutes(app, db);
}

module.exports = initialize;
