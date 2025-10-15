const { connect, clear, close, getDb } = require('./testDB');
const applicationService = require('../Services/loanApplicationService');
const bcrypt = require('bcrypt');
const applicationSchema = require("../schemas/loanApplicationSchema");
const {mockApplication} = require("./mocks");