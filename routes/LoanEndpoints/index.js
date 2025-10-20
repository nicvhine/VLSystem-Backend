const express = require("express");
const router = express.Router();

const postLoan = require("./postLoan");
const getLoan = require("./getLoan");

// Mount loan routes (create and fetch)
module.exports = (db) => {
  router.use("/", postLoan(db));
  router.use("/", getLoan(db));
  return router;
};
