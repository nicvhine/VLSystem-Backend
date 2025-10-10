const express = require("express");
const router = express.Router();

const postBorrower = require("./postBorrower");
const getBorrower = require("./getBorrower");
const deleteBorrower = require("./deleteBorrower");
const putBorrower = require("./putBorrower");

module.exports = (db) => {
  router.use("/", postBorrower(db));
  router.use("/", getBorrower(db));
  router.use("/", deleteBorrower(db));
  router.use("/", putBorrower(db));
  return router;
};
