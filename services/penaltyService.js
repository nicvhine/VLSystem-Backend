module.exports = (repo, db) => {
    return {
      async endorsePenalty(collection, formData, userId) {
        const penaltyRate =
          collection.status === "Past Due" ? 0.02 :
          collection.status === "Overdue" ? 0.05 :
          0;
  
        const penaltyAmount = collection.periodAmount * penaltyRate;
  
        const newEndorsement = {
          referenceNumber: collection.referenceNumber,
          collectionId: collection.collectionId,
          loanId: collection.loanId,
          borrowerId: collection.borrowerId,
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
      
        // Compute penalty and update collection
        const collection = await db.collection("collections").findOne({ _id: endorsement.collectionId });
        if (!collection) throw new Error("Collection not found");
      
        const { periodAmount: baseAmount, status: collectionStatus, loanId } = collection;
      
        // Compute penalty rate
        const penaltyRate =
          collectionStatus === "Past Due" ? 0.02 :
          collectionStatus === "Overdue" ? 0.05 : 0;
      
        const penaltyAmount = baseAmount * penaltyRate;
        const newPeriodAmount = baseAmount + penaltyAmount;
      
        // Update collection
        await db.collection("collections").updateOne(
          { _id: collection._id },
          {
            $set: {
              penaltyAmount,
              penaltyRate,
              periodAmount: newPeriodAmount,
              lastPenaltyUpdated: new Date()
            }
          }
        );
      
        // Update loan credit score
        if (loanId) {
          const loan = await db.collection("loans").findOne({ _id: loanId });
          if (loan) {
            let delta = 0;
            if (collectionStatus === "On Time") delta = 0.5;
            if (collectionStatus === "Past Due") delta = -0.5;
            if (collectionStatus === "Overdue") delta = -1.5;
      
            let newCreditScore = (loan.creditScore || 0) + delta;
            if (newCreditScore > 10) newCreditScore = 10;
            if (newCreditScore < 0) newCreditScore = 0;
      
            await db.collection("loans").updateOne(
              { _id: loanId },
              { $set: { creditScore: newCreditScore } }
            );
          }
        }
      
        // Update endorsement status
        const updateData = {
          status: "Approved",
          approvedBy: approverId,
          dateReviewed: new Date(),
          remarks
        };
        await repo.update(id, updateData);
      
        return { ...updateData, penaltyAmount, penaltyRate, newPeriodAmount };
      },      
      
      async rejectEndorsement(id, approverId, remarks = null) {
        const endorsement = await repo.getById(id);
        if (!endorsement) throw new Error("Endorsement not found");
      
        const updateData = {
          status: "Rejected",
          approvedBy: approverId,
          dateReviewed: new Date(),
          remarks,
        };
      
        await repo.update(id, updateData);
        return updateData;
      },
      
    };
  };
  