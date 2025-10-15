const { z } = require('zod');

const borrowerSchema = z.object({
    borrowersId: z.string(),
    name: z.string(),
    role: z.string(), 
    username: z.string(),
    password: z.string(), 
    isFirstLogin: z.boolean().default(true),
    assignedCollector: z.string(),
    email: z.string().email(),
    profilePic: z.string().url().optional()
});

module.exports = borrowerSchema;
