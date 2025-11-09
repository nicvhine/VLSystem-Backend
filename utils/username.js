// Generate a unique borrower username from full name
async function generateBorrowerUsername(name, borrowersCollection) {
    const parts = name.trim().toLowerCase().split(" ");
    if (parts.length < 2) return null;
  
    let baseUsername = parts[0].slice(0, 3) + parts[parts.length - 1];
    let username = baseUsername;
    let count = 1;
  
    while (await borrowersCollection.findOne({ username })) {
      count++;
      username = baseUsername + count;
    }
  
    return username;
  }


// Generate a unique staff username based on role and first name
async function generateStaffUsername(name, role, usersRepo) {
  const parts = name.trim().toLowerCase().split(" ");
  const firstName = parts[0];
  const base = `${role.toLowerCase()}${firstName}`;
  let username = base, count = 1;

  while (await usersRepo.findByUsername(username)) {
    count++;
    username = base + count;
  }
  return username;
}
  
  module.exports = { generateBorrowerUsername, generateStaffUsername };
  