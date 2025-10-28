module.exports = (repo, db) => {
  return {
    async endorsePenalty(collection, formData, userId) {
      const penaltyRate =
        collection.status === "Past Due" ? 0.02 :
        collection.status === "Overdue" ? 0.05 : 0;

      const penaltyAmount = collection.periodAmount * penaltyRate;

      const newEndorsement = {
        referenceNumber: collection.referenceNumber,
        collectionId: collection.collectionId,
        loanId: collection.loanId,
        borrowerId: collection.borrowerId,
        paidAmount: collection.paidAmount,
        borrowerName: collection.name,
        status: "Pending",
        endorsedBy: userId,
        reason: formData.reason,
        penaltyAmount,
        penaltyRate,
        collectionStatus: collection.status,
        dateEndorsed: new Date(),
        dateReviewed: null,
      };

      const insertedId = await repo.create(newEndorsement);
      return { insertedId, penaltyAmount, penaltyRate };
    },

    async getAllEndorsements() {
      return await repo.getAll();
    },

    async approveEndorsement(id, approverId, remarks = null) {
      const endorsement = await repo.getById(id);
      if (!endorsement) throw new Error("Endorsement not found");
    
      const collection = await db.collection("collections").findOne({ collectionId: endorsement.collectionId });
      if (!collection) throw new Error("Collection not found");
    
      const { periodAmount: baseAmount, status: oldStatus, loanId, paidAmount } = collection;
    
      const penaltyRate =
        oldStatus === "Past Due" ? 0.02 :
        oldStatus === "Overdue" ? 0.05 : 0;
    
      const penaltyAmount = baseAmount * penaltyRate;
      const newPeriodAmount = baseAmount + penaltyAmount;
      const newPeriodBalance = newPeriodAmount - paidAmount;
    
      let updatedStatus = "Unpaid";
      if (newPeriodBalance <= 0) updatedStatus = "Paid";
      else if (oldStatus === "Past Due") updatedStatus = "Past Due";
      else if (oldStatus === "Overdue") updatedStatus = "Overdue";
      else updatedStatus = "Unpaid";
    
      await db.collection("collections").updateOne(
        { collectionId: collection.collectionId },
        {
          $set: {
            penaltyAmount,
            penaltyRate,
            periodAmount: newPeriodAmount,
            paidAmount: newPeriodBalance,
            status: updatedStatus,
            lastPenaltyUpdated: new Date(),
          }
        }
      );
    
      if (loanId) {
        const loan = await db.collection("loans").findOne({ loanId });
        if (loan) {
          let delta = 0;
          switch (updatedStatus) {
            case "Paid": delta = 0.5; break;
            case "Past Due": delta = -0.5; break;
            case "Overdue": delta = -1.5; break;
            default: delta = 0; break;
          }
    
          let newCreditScore = (loan.creditScore || 0) + delta;
          newCreditScore = Math.min(Math.max(newCreditScore, 0), 10);
    
          await db.collection("loans").updateOne(
            { loanId },
            { $set: { creditScore: newCreditScore } }
          );
        }
      }
    
      const updateData = {
        status: "Approved",
        approvedBy: approverId,
        dateReviewed: new Date(),
        remarks,
      };
      await repo.update(id, updateData);
    
      return {
        ...updateData,
        penaltyAmount,
        penaltyRate,
        newPeriodAmount,
        newPeriodBalance,
        updatedStatus,
      };
    },
    

    async rejectEndorsement(id, approverId, remarks = null) {
      const endorsement = await repo.getById(id);
      if (!endorsement) throw new Error("Endorsement not found");

      const updateData = {
        status: "Rejected",
        approvedBy: approverId,
        dateReviewed: new Date(),
      };

      await repo.update(id, updateData);
      return updateData;
    },
  };
};
