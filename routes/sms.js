// server/routes/sms.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/send-sms', async (req, res) => {
  const { phoneNumber, code } = req.body;

  try {
    const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: 'd5d9585a8d91b2a5bf7d8a4b3f8dc9ec',
      number: phoneNumber,
      message: `Your verification code is: ${code}`,
      sendername: 'VISTULA LENDING CORP',
    });

    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('SMS send error:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to send SMS' });
  }
});

module.exports = router;
