  const express = require('express');
  const cors = require('cors');
  const { MongoClient } = require('mongodb');
  const path = require('path');

  const app = express();
  const PORT = 3001;

  app.use(express.json());

  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use(cors({
    origin: 'http://localhost:3000',  
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));


  const uri = 'mongodb+srv://nichole:Nichole_25@cluster0.gxpgomv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
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

      //USERS
      const users = db.collection('users');
      const maxUserAgg = await users.aggregate([
        {
          $addFields: {
            userIdNum: {
              $convert: {
                input: "$userId",
                to: "int",
                onError: 0,
                onNull: 0
              }
            }
          }
        }, 
        { $sort: { userIdNum: -1 } },
        { $limit: 1 }
      ]).toArray();
      
      let maxSeq = 0;
      if (maxUserAgg.length > 0) {
        maxSeq = maxUserAgg[0].userIdNum;
      }
      
    //APPLICATIONS
    const applications = db.collection('loan_applications');
    const maxApplicationAgg = await applications.aggregate([
      { $addFields: {
        applicationIdNum: {
          $convert: {
            input: "$applicationId",
            to: "int",
            onError: 0,
            onNull: 0
          }
        }
      }
    },  
    { $sort: { applicationIdNum: -1 } },
    { $limit: 1 }
    ]).toArray();

      let maxApplicationSeq = 0;
      if (maxApplicationAgg.length > 0) {
        maxApplicationSeq = maxApplicationAgg[0].applicationIdNum;
      }

    //BORROWERS
    const borrowersAccount = db.collection('borrowers_account');
    const maxBorrowersAccountagg = await borrowersAccount.aggregate([
      {
        $addFields: {
          numericBorrowersId: {
            $convert: {
              input: { $substr: ["$borrowersId", 1, -1] },
              to: "int",
              onError: 0,
              onNull: 0
            }
          }
        }
      },    
      { $sort: { numericBorrowersId: -1 } },
      { $limit: 1 }
    ]).toArray();


    let maxBorrowersSeq = 0;
    if (maxBorrowersAccountagg.length > 0) {
      maxBorrowersSeq = maxBorrowersAccountagg[0].numericBorrowersId; 
    }

    //LOANS
    const loan = db.collection('loans');
    const MaxLoanAgg = await loan.aggregate([
      {
        $addFields: {
          numericLoanId: {
            $convert: {
              input: { $substr: ["$loanId", 1, -1] },
              to: "int",
              onError: 0,
              onNull: 0
            }
          }
        }
      },    
      { $sort: { numericLoanId: -1 } },
      { $limit: 1 }
    ]).toArray();


    let maxLoanSeq = 0;
    if (MaxLoanAgg.length > 0) {
      maxLoanSeq = MaxLoanAgg[0].numericLoanId; 
    }

    //COLLECTIONS

      const counters = db.collection('counters');
      await counters.updateOne({ _id: 'userId' }, { $set: { seq: maxSeq } }, { upsert: true });
      await counters.updateOne({ _id: 'applicationId' }, { $set: { seq: maxApplicationSeq } }, { upsert: true });
      await counters.updateOne({ _id: 'borrowersId' }, { $set: { seq: maxBorrowersSeq } }, { upsert: true });
      await counters.updateOne({ _id: 'loanId' }, { $set: { seq: maxLoanSeq } }, { upsert: true });


      console.log("Counter initialized to:", maxSeq);

      const userRoutes = require('./routes/userRoutes')(db);
      const loanApplicationRoutes = require('./routes/loanApplicationRoutes')(db, getNextSequence);
      const borrowersRoutes = require('./routes/borrowersRoutes')(db);
      const loanRoutes = require('./routes/loanRoutes')(db);
      const collectionRoutes = require('./routes/collectionRoutes')(db);
      const paymentRoutes = require('./routes/paymentRoutes')(db);
      const notificationRoutes = require('./routes/notificationRoutes')(db);
      const logsRoute = require('./routes/logs')(db);
      const smsRoutes = require('./routes/sms');

      app.use('/users', userRoutes);
      app.use('/loan-applications', loanApplicationRoutes);
      app.use('/borrowers', borrowersRoutes);
      app.use('/loans', loanRoutes);
      app.use('/collections', collectionRoutes);  
      app.use('/payments', paymentRoutes);
      app.use('/notifications', notificationRoutes);
      app.use('/logs', logsRoute);
      app.use('/api', smsRoutes);
      app.use('/uploads', express.static('uploads'));

      
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    } catch (err) {
      console.error('Failed to start server:', err);
    }
  }

  start();