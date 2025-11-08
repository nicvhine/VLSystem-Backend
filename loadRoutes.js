const {getNextSequence} = require("./utils/database");
const express = require('express');

// Register API routes and static assets
function loadRoutes(app, db) {
    const userRoutes = require('./Routes/StaffEndpoints')(db);
    const loanApplicationRoutes = require('./Routes/ApplicationEndpoints')(db, getNextSequence);
    const borrowersRoutes = require('./Routes/BorrowerEndpoints')(db);
    const loanRoutes = require('./Routes/LoanEndpoints')(db);
    const collectionRoutes = require('./Routes/CollectionEndpoints')(db);
    const paymentRoutes = require('./Routes/PaymentEndpoints')(db);
    const notificationRoutes = require('./Routes/NotificationEndpoints')(db);
    const smsRoutes = require('./Routes/SemaphoreEndpoints')(db);
    const agentRoutes = require('./Routes/AgentEndpoints')(db);
    const statRoutes = require('./Routes/StatsEndpoints')(db);
    const penaltyRoutes = require('./Routes/PenaltyEndpoints')(db);
    const closureRoutes = require('./Routes/ClosureEndpoints')(db);
    const otpRoutes = require('./Routes/otpEndpoint')(db);
    const sysadRoutes = require('./Routes/sysadDashboard')(db);

    require('./Routes/ApplicationEndpoints/cleanup');
    // require('./Routes/CollectionEndpoints/statusUpdate');
    
    const { startNotificationCron } = require("./Routes/NotificationEndpoints/triggerNotification");
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