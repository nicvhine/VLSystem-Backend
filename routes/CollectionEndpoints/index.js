const express = require("express");
const router = express.Router();

const getCollection = require("./getCollection");

// Mount collection endpoints (read schedules)
module.exports = (db) => {
  router.use("/", getCollection(db));
  return router;
};
