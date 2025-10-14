require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, CORS_OPTIONS } = require('./config');
const { closeDatabase } = require('./utils/database');
const initialize = require('./initialize');

const app = express();

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(cors(CORS_OPTIONS));

initialize(app)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
    });

process.on('SIGINT', async () => {
  await closeDatabase();
  console.log('MongoDB connection closed');
  process.exit(0);
});
