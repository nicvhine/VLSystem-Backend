const ClosureRepo = require("../Repositories/closureRepository");
const { generateClosureEndorsementId } = require("../Utils/generator");

const ClosureService = (db) => {
  const repo = new ClosureRepo(db);

  const createClosure = async ({ clientName, reason, date, authorizedBy, loanId }) => {
    if (!clientName || !reason || !date || !authorizedBy || !loanId)
      throw new Error("All fields are required");

    const endorsementId = await generateClosureEndorsementId(db.collection("closure_endorsements"));

    const newClosure = {
      endorsementId,
      clientName,
      reason,
      date,
      authorizedBy,
      loanId,
      signatureAttached: false,
      status: "Pending",
      createdAt: new Date(),
    };

    return repo.insertClosure(newClosure);
  };

  const getAllClosure = async () => repo.getAllClosure();

  const getClosureById = async (endorsementId) => {
    const closure = await repo.getClosureById(endorsementId);
    if (!closure) throw new Error("Closure not found");
    return closure;
  };

  // NEW: get closure by loanId
  const getClosureByLoanId = async (loanId) => {
    const closure = await repo.getClosureByLoanId(loanId);
    return closure || null;
  };

  const updateClosure = async (endorsementId, updateFields) => {
    const updated = await repo.updateClosure(endorsementId, updateFields);
    if (!updated) throw new Error("Closure not found");
    return updated;
  };

  return { createClosure, getAllClosure, getClosureById, getClosureByLoanId, updateClosure };
};

module.exports = ClosureService;
