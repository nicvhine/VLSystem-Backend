const express = require('express');
const router = express.Router();

module.exports = (db) => {
  router.get('/:borrowersId', async (req, res) => {
    const { borrowersId } = req.params;

    if (!borrowersId) {
      return res.status(400).json({ error: 'Missing borrowersId' });
    }

    try {
      const collectionsCol = db.collection('collections');
      const notificationsCol = db.collection('notifications');

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);

      const dueCollections = await collectionsCol.find({
        borrowersId,
        status: 'Unpaid',
        dueDate: { $gte: today, $lte: threeDaysLater }
      }).sort({ dueDate: 1 }).toArray();

      const existingDueRefs = (
        await notificationsCol.find({
          borrowersId,
          type: 'due'
        }).toArray()
      ).map(n => n.referenceNumber);

      const newDueNotifs = [];

      for (const c of dueCollections) {
        if (!existingDueRefs.includes(c.referenceNumber)) {
          const dueDate = new Date(c.dueDate);
          const diffTime = dueDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // in days

          const dueNotif = {
            id: `due-${c.referenceNumber}`,
            message: `📅 Payment due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} for Collection ${c.collectionNumber}`,
            referenceNumber: c.referenceNumber,
            borrowersId: c.borrowersId,
            date: c.dueDate,
            viewed: false,
            type: 'due',
            createdAt: new Date()
          };

          newDueNotifs.push(dueNotif);
        }
      }

      if (newDueNotifs.length > 0) {
        await notificationsCol.insertMany(newDueNotifs);
      }

      const allNotifs = await notificationsCol
        .find({ borrowersId })
        .sort({ date: -1 })
        .toArray();

      const finalMapped = allNotifs.map(n => ({
        ...n,
        id: n.id || `notif-${n.referenceNumber}-${Date.now()}`,
        type: n.type || 'success'
      }));

      res.json(finalMapped);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
