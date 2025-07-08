const express = require('express');
const router = express.Router();
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey: '6ab8cc1f',
  apiSecret: 'JRHMoN1ENtq9usyW',
});

const formatPhoneNumber = (number) => {
  if (number.startsWith('0')) {
    return '63' + number.slice(1);
  }
  return number;
};

router.post('/send-sms', async (req, res) => {
  const { phoneNumber, code } = req.body;

  const from = 'VISTULA';
  const to = formatPhoneNumber(phoneNumber);
  const text = `OTP: ${code}. Valid until ${new Date(Date.now() + 15 * 60000).toLocaleTimeString()}. Do not share this code.`;

  try {
    const response = await vonage.sms.send({ to, from, text });
    console.log('SMS sent successfully:', response);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('SMS send error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send SMS' });
  }
});

module.exports = router;
