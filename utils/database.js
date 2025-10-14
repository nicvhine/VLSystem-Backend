const { MongoClient } = require('mongodb');
const { MONGODB_URI } = require('../config');

const client = new MongoClient(MONGODB_URI);

async function connectToDatabase() {
    await client.connect();
    const db = client.db('VLSystem');
    return db;
}

function closeDatabase() {
    return client.close();
}


async function getNextSequence(db, name) {
    const counters = db.collection('counters');
    const result = await counters.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );
    if (!result.value || typeof result.value.seq !== 'number') {
        await counters.updateOne({ _id: name }, { $set: { seq: 1 } }, { upsert: true });
        return 1;
    }
    return result.value.seq;
}

async function getMaxNumericId(db, collectionName, fieldName, stripPrefix = false) {
    const collection = db.collection(collectionName);
    const pipeline = [
        {
            $addFields: {
                numericId: {
                    $convert: {
                        input: stripPrefix ? { $substr: [`$${fieldName}`, 1, -1] } : `$${fieldName}`,
                        to: "int",
                        onError: 0,
                        onNull: 0
                    }
                }
            }
        },
        { $sort: { numericId: -1 } },
        { $limit: 1 }
    ];
    const result = await collection.aggregate(pipeline).toArray();
    return result.length > 0 ? result[0].numericId : 0;
}

module.exports = { connectToDatabase, closeDatabase, getNextSequence, getMaxNumericId};