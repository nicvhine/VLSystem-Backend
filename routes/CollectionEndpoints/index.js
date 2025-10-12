const express = require("express");
const router = express.Router();

const getCollection = require("./getCollection");

module.exports = (db) => {
  router.use("/", getCollection(db));
  return router;
};
