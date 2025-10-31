const express = require('express');
const router = express.Router();
const axios = require('axios');

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;

// Optional: helper to ensure proper formatting
function formatPhoneNumber(number) {
  let cleaned = number.toString().replace(/\D/g, '');
  if (!cleaned.startsWith('63') && cleaned.startsWith('0')) {
    cleaned = '63' + cleaned.slice(1);
  }
  return cleaned;
}

// POST /api/send-sms
router.post('/', async (req, res) => {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return res.status(400).json({ success: false, error: 'Missing phone number or code' });
  }

  const to = formatPhoneNumber(phoneNumber);
  const message = `OTP: ${code}. Valid until ${new Date(Date.now() + 15 * 60000).toLocaleTimeString()}. Do not share this code.`;

  try {
    const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: SEMAPHORE_API_KEY,
      number: to,
      message,
      sendername: 'VISTULA'
    });

    console.log(' SMS sent:', response.data);
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
