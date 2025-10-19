const {getNextSequence} = require("./Utils/database");
const express = require('express');

// Register API routes and static assets
function loadRoutes(app, db) {
    const userRoutes = require('./Routes/StaffEndpoints')(db);
    const loanApplicationRoutes = require('./Routes/ApplicationEndpoints')(db, getNextSequence);
    const borrowersRoutes = require('./Routes/BorrowerEndpoints')(db);
    const loanRoutes = require('./Routes/LoanEndpoints')(db);
    const collectionRoutes = require('./Routes/CollectionEndpoints')(db);
    const paymentRoutes = require('./Routes/paymentRoutes')(db);
    const notificationRoutes = require('./Routes/notificationRoutes')(db);
    const logsRoute = require('./Routes/logs')(db);
    const smsRoutes = require('./Routes/sms');
    const agentRoutes = require('./Routes/AgentEndpoints')(db);

    app.use('/users', userRoutes);
    app.use('/loan-applications', loanApplicationRoutes);
    app.use('/borrowers', borrowersRoutes);
    app.use('/loans', loanRoutes);
    app.use('/collections', collectionRoutes);
    app.use('/payments', paymentRoutes);
    app.use('/notifications', notificationRoutes);
    app.use('/logs', logsRoute);
    app.use('/api', smsRoutes);
    app.use('/uploads', express.static('uploads'));
    app.use('/agents', agentRoutes);

    app.get("/ping", (req, res) => { res.json({ message: "pong from root" }); });

    console.log('Routes loaded');

}

module.exports = loadRoutes