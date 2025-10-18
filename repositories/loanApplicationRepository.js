module.exports = (db) => {
  const loanApplications = db.collection("loan_applications");
  const agents = db.collection("agents");

  return {
    loanApplications, 
    agents,  
    async insertLoanApplication(application) {
      return await loanApplications.insertOne(application);
    },

    async getAllApplications() {
      return await loanApplications.find().toArray();
    },

    async findPendingByApplicant(appName, appDob, appContact, appEmail) {
      return await loanApplications.findOne({
        appName: appName.trim(),
        appDob: appDob.trim(),
        appContact: appContact.trim(),
        appEmail: appEmail.trim(),
        status: "Pending",
      });
    },

    async findAgentById(agentId) {
      return await agents.findOne({ agentId });
    },

    async getInterviewList() {
      return await loanApplications
        .find({ interviewDate: { $exists: true } })
        .project({
          applicationId: 1,
          appName: 1,
          interviewDate: 1,
          interviewTime: 1,
          status: 1,
          appAddress: 1,
          _id: 0,
        })
        .toArray();
    },

    async countByStatus(statusRegex) {
      return await loanApplications.countDocuments({
        status: { $regex: statusRegex, $options: "i" },
      });
    },

    async getLoanTypeStats() {
      return await loanApplications
        .aggregate([
          {
            $group: {
              _id: "$loanType",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              loanType: "$_id",
              count: 1,
            },
          },
        ])
        .toArray();
    },
  };
};
