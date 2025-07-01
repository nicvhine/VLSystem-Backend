const express = require('express');
const router = express.Router();

module.exports = (db) => {

// GET payments
router.get('/', async (req, res) => {
  const { loanId } = req.query;

  try {
    const query = loanId ? { loanId } : {};
    const payments = await db.collection('payments')
      .find(query)
      .sort({ datePaid: -1 })
      .toArray();

    res.json(payments);
  } catch (err) {
    console.error('Error fetching payments:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

return router;
}
