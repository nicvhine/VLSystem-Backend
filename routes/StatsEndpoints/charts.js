const express = require('express');
const router = express.Router();
const authenticateToken = require('../../Middleware/auth');

module.exports = (db) => {
  const loans = db.collection('loans');

  // GET INTEREST AMOUNT PER MONTH
  router.get('/monthly-interest', authenticateToken, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();

      const result = await loans.aggregate([
        {
          $match: {
            status: 'approved', 
            paymentDate: {
              $gte: new Date(`${year}-01-01`),
              $lte: new Date(`${year}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: { $month: '$paymentDate' },
            totalInterest: { $sum: '$interestAmount' },
          },
        },
        { $sort: { '_id': 1 } },
      ]).toArray();

      const monthlyInterest = Array.from({ length: 12 }, (_, i) => {
        const monthData = result.find(r => r._id === i + 1);
        return { month: i + 1, totalInterest: monthData ? monthData.totalInterest : 0 };
      });

      res.json(monthlyInterest);
    } catch (err) {
      console.error('Failed to get monthly interest:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
};
