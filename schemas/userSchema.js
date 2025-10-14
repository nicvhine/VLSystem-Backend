const { z } = require('zod');

const userSchema = z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string().email(),
    phoneNumber: z.string(),
    role: z.string(), // consider z.enum([...]) if roles are fixed
    username: z.string(),
    password: z.string() // already hashed
});

module.exports = userSchema;
