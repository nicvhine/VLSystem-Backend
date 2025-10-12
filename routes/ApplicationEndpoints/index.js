const express = require("express");
const router = express.Router();

const postApplication = require("./postApplication");
const getApplication = require("./getApplication");
const putApplication = require("./putApplication");

module.exports = (db) => {
  router.use("/", postApplication(db));
  router.use("/", getApplication(db));
  router.use("/", putApplication(db));
  return router;
};
