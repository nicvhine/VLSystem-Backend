# ⚡ VLSystem Backend

This folder contains the **Node.js** backend for **VLSystem** — a robust REST API built with Express.js and MongoDB for a modern loan management system.

---

## 🚀 Tech Stack

- 🟢 **Node.js** with **Express.js** v5.1.0
- 🍃 **MongoDB** v6.20.0
- 🔐 **JWT Authentication** (jsonwebtoken)
- 🔒 **bcrypt** for password hashing
- 📁 **Multer** + **Cloudinary** for file uploads
- 📱 **Vonage** for SMS notifications
- ⏰ **Cron** for scheduled tasks
- ✅ **Zod** for validation
- 🧪 **Jest** for testing

---

## 🧰 Getting Started

1️⃣ Clone the repository
```bash
git clone https://github.com/yourusername/VLSystem.git
cd VLSystem/VLSystem-Backend
```

2️⃣ Install dependencies
```bash
npm install
```

3️⃣ Set up environment variables
Create a `.env` file in the root directory:
```bash
MONGODB_URI=mongodb://example/=cluster0
FRONTEND_URL:http://localhost:3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key
WEBHOOK_SECRET=your_web_secret
PAYMONGO_SECRET_KEY=your_paymongo_secret
PAYMONGO_PUBLIC_KEY=your_paymongo_public
PAYMONGO_BASE_URL=https://api.paymongo.com/ex1
```

4️⃣ Start MongoDB
```bash
# Make sure MongoDB is running on your system
mongod
```

5️⃣ Run the development server
```bash
npm run dev
```
Visit 👉 http://localhost:3001

---

## 🏗️ Production Build

```bash
cd VLSystem-Backend
npm install --production
npm start
```

---

## 🧾 Available Scripts

```bash
npm run dev     Start the development server with nodemon
npm start       Run the production server
npm test        Run Jest test suite
```

---

## 📦 Main Dependencies

| Category | Packages |
|----------|----------|
| **Web Framework** | express, cors, body-parser |
| **Database** | mongodb, mongodb-memory-server |
| **Authentication** | jsonwebtoken, bcrypt |
| **File Upload** | multer, cloudinary, multer-storage-cloudinary, sharp |
| **SMS/Communication** | @vonage/server-sdk |
| **Scheduling** | cron, node-cron |
| **Validation** | zod |
| **HTTP Client** | axios |
| **Utilities** | dotenv, streamifier |

---

## 🧑‍💻 Dev Dependencies

- **jest** - Testing framework
- **supertest** - HTTP assertion testing
- **nodemon** - Development server with auto-restart

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database
MONGODB_URI=mongodb://example/=cluster0

# Frontend
FRONTEND_URL:http://localhost:3000

# Cloudinary (File Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT Authentication
JWT_SECRET=your_jwt_secret_key

# Encryption
ENCRYPTION_KEY=your_encryption_key

# Webhook
WEBHOOK_SECRET=your_web_secret

# PayMongo (Payment Processing)
PAYMONGO_SECRET_KEY=your_paymongo_secret
PAYMONGO_PUBLIC_KEY=your_paymongo_public
PAYMONGO_BASE_URL=https://api.paymongo.com/ex1
```

---

## 📁 Project Structure

```bash
VLSystem-Backend/
├── config.js              # Server configuration
├── createApp.js           # Express app initialization
├── server.js              # Entry point
├── loadCounters.js        # Database counter initialization
├── loadRoutes.js          # Route loading logic
├── middleware/            # Authentication & authorization
│   ├── auth.js
│   └── authorizeRole.js
├── routes/                # API endpoints
│   ├── AgentEndpoints/
│   ├── ApplicationEndpoints/
│   ├── BorrowerEndpoints/
│   ├── CollectionEndpoints/
│   ├── LoanEndpoints/
│   ├── StaffEndpoints/
│   └── [other route files]
├── repositories/          # Data access layer
├── services/              # Business logic
├── schemas/               # Data validation schemas
├── utils/                 # Utility functions
├── tests/                 # Test files
└── uploads/               # File upload storage
```

---

## 🧩 API Endpoints

### Core Modules
- **👥 Agents** - Agent management
- **📋 Applications** - Loan application processing
- **👤 Borrowers** - Borrower information management
- **💰 Loans** - Loan management and tracking
- **👨‍💼 Staff** - Staff management
- **📊 Collections** - Payment collection tracking
- **🔔 Notifications** - SMS and system notifications
- **💳 Payments** - Payment processing (PayMongo integration)

---

## 🧠 Key Features

- 🔐 **JWT-based authentication** with role-based authorization
- 📁 **File upload system** with Cloudinary integration
- 📱 **SMS notifications** via Vonage
- 💳 **Payment processing** with PayMongo webhooks
- ⏰ **Scheduled tasks** for automated processes
- 🧪 **Comprehensive testing** with Jest
- 📊 **Loan calculations** and collection tracking
- 🔒 **Secure password hashing** with bcrypt

---

## 🧠 Troubleshooting

| Issue | Possible Fix |
|-------|--------------|
| MongoDB connection failed | Check if MongoDB is running and MONGODB_URI is correct |
| CORS errors | Verify CORS_OPTIONS in config.js matches frontend URL |
| File upload issues | Check Cloudinary credentials and configuration |
| SMS not sending | Verify Vonage API credentials |
| JWT token errors | Check JWT_SECRET is set and consistent |
| Port already in use | Change PORT in .env or kill existing process |

---

## 🌐 Frontend Integration

The backend is configured to work with the VLSystem frontend:

- **Frontend URL**: http://localhost:3000
- **CORS**: Configured for localhost:3000
- **File serving**: Static files served from `/uploads` endpoint

---

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Tests are located in the `tests/` directory and use Jest with Supertest for API testing.

---

## 🔧 Development Notes

- Uses **nodemon** for automatic server restarts during development
- **MongoDB Memory Server** for testing with in-memory database
- **Sharp** for image processing and optimization
- **Streamifier** for handling file streams with Cloudinary

---

🪄 **Default Development URL**: http://localhost:3001

Built with ❤️ using Node.js, Express.js, and MongoDB.
