const express = require("express");
const router = express.Router();

const postBorrower = require("./postBorrower");
const putBorrower = require("./putBorrower");

module.exports = (db) => {
  router.use("/", postBorrower(db));
  router.use("/", putBorrower(db));
  return router;
};
