const express = require("express");
const router = express.Router();

const postAgent = require("./postAgent");
const getAgents = require("./getAgent");

module.exports = (db) => {
  router.use("/", postAgent(db));
  router.use("/", getAgents(db));
  return router;
};
