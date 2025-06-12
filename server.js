const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const uri = 'mongodb+srv://nichole:nichole@cluster0.gxpgomv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);

async function getNextSequence(db, name) {
  const counters = db.collection('counters');
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  if (!result.value || typeof result.value.seq !== 'number') {
    await counters.updateOne({ _id: name }, { $set: { seq: 1 } }, { upsert: true });
    return 1;
  }
  return result.value.seq;
}

async function start() {
  try {
    await client.connect();
    const db = client.db('VLSystem');

    const users = db.collection('users');
    const maxUserAgg = await users.aggregate([
      { $addFields: { userIdNum: { $toInt: "$userId" } } },
      { $sort: { userIdNum: -1 } },
      { $limit: 1 }
    ]).toArray();
    let maxSeq = 0;
    if (maxUserAgg.length > 0) maxSeq = maxUserAgg[0].userIdNum;

  const applications = db.collection('loan_applications');
  const maxApplicationAgg = await applications.aggregate([
  { $addFields: { applicationIdNum: { $toInt: "$applicationId" }}},
  { $sort: { applicationIdNum: -1 } },
  { $limit: 1 }
  ]).toArray();

    let maxApplicationSeq = 0;
    if (maxApplicationAgg.length > 0) {
      maxApplicationSeq = maxApplicationAgg[0].applicationIdNum;
    }

    const counters = db.collection('counters');
    await counters.updateOne({ _id: 'userId' }, { $set: { seq: maxSeq } }, { upsert: true });
    await counters.updateOne({ _id: 'applicationId' }, { $set: { seq: maxApplicationSeq } }, { upsert: true });

    console.log("Counter initialized to:", maxSeq);

    const userRoutes = require('./routes/userRoutes')(db);
    const loanApplicationRoutes = require('./routes/loanApplicationRoutes')(db, getNextSequence);

    app.use('/users', userRoutes);
    app.use('/loan-applications', loanApplicationRoutes);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

start();
