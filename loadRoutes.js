const {getNextSequence} = require("./utils/database");
const express = require('express');

// Register API routes and static assets
function loadRoutes(app, db) {
    const userRoutes = require('./routes/StaffEndpoints')(db);
    const loanApplicationRoutes = require('./routes/ApplicationEndpoints')(db, getNextSequence);
    const borrowersRoutes = require('./routes/BorrowerEndpoints')(db);
    const loanRoutes = require('./routes/LoanEndpoints')(db);
    const collectionRoutes = require('./routes/CollectionEndpoints')(db);
    const paymentRoutes = require('./routes/PaymentEndpoints')(db);
    const notificationRoutes = require('./routes/NotificationEndpoints')(db);
    const smsRoutes = require('./routes/SemaphoreEndpoints')(db);
    const agentRoutes = require('./routes/AgentEndpoints')(db);
    const statRoutes = require('./routes/StatsEndpoints')(db);
    const penaltyRoutes = require('./routes/PenaltyEndpoints')(db);
    const closureRoutes = require('./routes/ClosureEndpoints')(db);
    const otpRoutes = require('./routes/otpEndpoint')(db);
    const sysadRoutes = require('./routes/sysadDashboard')(db);

    require('./routes/ApplicationEndpoints/cleanup');
    // require('./routes/CollectionEndpoints/statusUpdate');
    
    const { startNotificationCron } = require("./routes/NotificationEndpoints/triggerNotification");
    startNotificationCron(db);
    
    app.use('/users', userRoutes);
    app.use('/loan-applications', loanApplicationRoutes);
    app.use('/borrowers', borrowersRoutes);
    app.use('/loans', loanRoutes);
    app.use('/collections', collectionRoutes);
    app.use('/payments', paymentRoutes);
    app.use('/notifications', notificationRoutes);
    app.use('/sms', smsRoutes);
    app.use('/uploads', express.static('uploads'));
    app.use('/agents', agentRoutes);
    app.use('/stat', statRoutes);
    app.use('/penalty', penaltyRoutes);
    app.use('/closure', closureRoutes);
    app.use('/otp', otpRoutes);
    app.use('/sysad', sysadRoutes);

    app.get("/ping", (req, res) => { res.json({ message: "pong from root" }); });

    console.log('Routes loaded');

}

module.exports = loadRoutes