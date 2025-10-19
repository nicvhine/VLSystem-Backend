# VLSystem Backend

This folder contains the backend API for the VLSystem application.

Tech stack
- Node.js (recommended v18+)
- Express (v5)
- MongoDB (official driver)
- JWT-based authentication
- Multer + Cloudinary for file uploads
- Jest + Supertest for tests

Quick start (development)
```powershell
cd VLSystem-Backend
npm install
# create a .env file (see .env.example if present)
npm run dev   # runs server.js with nodemon
```

Production
```powershell
cd VLSystem-Backend
npm install --production
npm start
```

Available scripts (package.json)
- `dev` — run `nodemon server.js` for development
- `start` — run `node server.js` for production
- `test` — run Jest tests

Configuration
- `server.js` — entry point. It loads `createApp()` and listens on `PORT`.
- `config.js` — central configuration (PORT, MONGODB_URI, CORS_OPTIONS, BACKEND_URL)

Environment variables (example)
Create `VLSystem-Backend/.env` with values similar to:

```ini
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.../dbname
JWT_SECRET=replace_with_secure_value
FRONTEND_URL=http://localhost:3000
PAYMONGO_PUBLIC_KEY=pk_test_...
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_BASE_URL=https://api.paymongo.com/v1
WEBHOOK_SECRET=replace_with_value
ENCRYPTION_KEY=32_byte_key_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Important folders
- `routes/` — all Express route handlers grouped by feature
- `repositories/` — data access layer for DB operations
- `services/` — business logic and external integrations
- `utils/` — helpers (database connection, crypt, cloudinary, generators)

Testing
- Uses Jest and Supertest. Run `npm test` in this folder.
- Some tests use `mongodb-memory-server` for in-memory MongoDB.

Troubleshooting
- `MongoNetworkError`: check `MONGODB_URI`, Atlas IP access, or local MongoDB status.
- CORS errors: check `config.js` `CORS_OPTIONS.origin` (defaults to `http://localhost:3000`).
- Upload failures: verify Cloudinary credentials.

Security and best practices
- Keep `.env` files out of version control. Add `.env.example` with placeholders for onboarding.
- Rotate `JWT_SECRET`, `PAYMONGO_SECRET_KEY`, `CLOUDINARY_API_SECRET` regularly.

If you'd like, I can additionally:
- Add `VLSystem-Backend/.env.example` with placeholders.
- Add a `docker-compose.yml` to run local MongoDB + backend.
- Generate a short API reference for common endpoints.
