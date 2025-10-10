const express = require("express");
const router = express.Router();

const postAgent = require("./postAgent");
const getAgents = require("./getAgents");
const deleteAgent = require("./deleteAgent");
const putAgent = require("./putAgent");

module.exports = (db) => {
  router.use("/", postAgent(db));
  router.use("/", getAgents(db));
  router.use("/", deleteAgent(db));
  router.use("/", putAgent(db));
  return router;
};
