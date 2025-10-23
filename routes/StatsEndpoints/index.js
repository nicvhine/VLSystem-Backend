const express = require("express");
const router = express.Router();

const getCharts = require("./charts");
const getCards = require("./cards");
module.exports = (db) => {
  router.use("/", getCharts(db));
  router.use("/", getCards(db));

  return router;
};