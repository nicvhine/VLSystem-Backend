const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = 'mongodb+srv://nichole:nichole@cluster0.gxpgomv.mongodb.net/yourDBname?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB!");
    await client.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

testConnection();
