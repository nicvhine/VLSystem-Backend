const express = require("express");
const router = express.Router();

const postBorrower = require("./postBorrower");

module.exports = (db) => {
  router.use("/", postBorrower(db));
  return router;
};
