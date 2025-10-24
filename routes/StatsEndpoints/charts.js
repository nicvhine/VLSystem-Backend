const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');

module.exports = (db) => {
  const loans = db.collection('loans');

  router.get('/monthly-interest', authenticateToken, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();

      const result = await loans.aggregate([
        {
          // Only include approved loans within the selected year
          $match: {
            status: 'Approved',
            dateDisbursed: {
              $gte: new Date(`${year}-01-01T00:00:00Z`),
              $lte: new Date(`${year}-12-31T23:59:59Z`),
            },
          },
        },
        {
          // Convert appLoanAmount to a number before summing
          $addFields: {
            appLoanAmountNumeric: { $toDouble: '$appLoanAmount' },
          },
        },
        {
          // Group by month of disbursement
          $group: {
            _id: { $month: '$dateDisbursed' },
            totalPrincipal: { $sum: '$appLoanAmountNumeric' },
          },
        },
        {
          $sort: { '_id': 1 },
        },
      ]).toArray();

      // Ensure all 12 months are represented
      const monthlyPrincipal = Array.from({ length: 12 }, (_, i) => {
        const monthData = result.find(r => r._id === i + 1);
        return {
          month: i + 1,
          totalPrincipal: monthData ? monthData.totalPrincipal : 0,
        };
      });

      res.json(monthlyPrincipal);
    } catch (err) {
      console.error('Failed to get monthly principal:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
};
