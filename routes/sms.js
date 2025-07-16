const express = require('express');
const router = express.Router();
const axios = require('axios');

const SEMAPHORE_API_KEY = 'd5d9585a8d91b2a5bf7d8a4b3f8dc9ec';

const formatPhoneNumber = (number) => {
  if (number.startsWith('0')) {
    return '63' + number.slice(1);
  }
  return number;
};

router.post('/send-sms', async (req, res) => {
  const { phoneNumber, code } = req.body;

  const to = formatPhoneNumber(phoneNumber);
  const message = `OTP: ${code}. Valid until ${new Date(Date.now() + 15 * 60000).toLocaleTimeString()}. Do not share this code.`;

  try {
    const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: SEMAPHORE_API_KEY,
      number: to,
      message: message,
      sendername: 'VISTULA' 
    });

    console.log('SMS sent successfully:', response.data);
    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('SMS send error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message || 'Failed to send SMS'
    });
  }
});

module.exports = router;
