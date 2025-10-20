const express = require("express");
const router = express.Router();

const postSMS = require("./postSMS");

module.exports = (db) => {
  router.use("/", postSMS(db));
  return router;
};
