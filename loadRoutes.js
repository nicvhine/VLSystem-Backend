const {getNextSequence} = require("./utils/database");
const express = require('express');

function loadRoutes(app, db) {
    const userRoutes = require('./routes/StaffEndpoints')(db);
    const loanApplicationRoutes = require('./routes/ApplicationEndpoints')(db, getNextSequence);
    const borrowersRoutes = require('./routes/BorrowerEndpoints')(db);
    const loanRoutes = require('./routes/LoanEndpoints')(db);
    const collectionRoutes = require('./routes/CollectionEndpoints')(db);
    const paymentRoutes = require('./routes/paymentRoutes')(db);
    const notificationRoutes = require('./routes/notificationRoutes')(db);
    const logsRoute = require('./routes/logs')(db);
    const smsRoutes = require('./routes/sms');
    const agentRoutes = require('./routes/AgentEndpoints')(db);

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

    console.log('Routes loaded');

}

module.exports = loadRoutes