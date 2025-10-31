const express = require('express');
const router = express.Router();
const postSMS = require('./postSMS'); 

console.log('SemaphoreEndpoints module loaded');

router.use('/send-sms', postSMS);

module.exports = router;
