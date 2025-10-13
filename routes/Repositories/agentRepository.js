module.exports = (db) => {
    const agents = db.collection("agents");
  
    const findAgentByNameAndPhone = async (name, phoneNumber) =>
      await agents.findOne({ name: name.trim(), phoneNumber: phoneNumber.trim() });
  
    const getMaxAgentIdNum = async () => {
      const result = await agents
        .aggregate([
          { $addFields: { agentIdNum: { $toInt: { $substr: ["$agentId", 3, 5] } } } },
          { $sort: { agentIdNum: -1 } },
          { $limit: 1 },
        ])
        .toArray();
      return result.length > 0 ? result[0].agentIdNum : 0;
    };
  
    const insertAgent = async (agent) => await agents.insertOne(agent);
  
    return { findAgentByNameAndPhone, getMaxAgentIdNum, insertAgent };
  };
  