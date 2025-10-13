module.exports = (db) => {
    const loanApplications = db.collection("loan_applications");
    const agents = db.collection("agents");
  
    return {
      loanApplications, 
  
      async findAgentById(agentId) {
        return await agents.findOne({ agentId });
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
  
      async insertLoanApplication(application) {
        return await loanApplications.insertOne(application);
      },
    };
  };
  