# Local Backend Setup Guide - PostgreSQL + Node.js

This guide will help you set up a local backend server with PostgreSQL database for user authentication and progress tracking.

---

## Part 1: Install Prerequisites

### 1. Install PostgreSQL

**Download and Install:**
1. Go to https://www.postgresql.org/download/windows/
2. Download the Windows installer
3. Run installer and follow these settings:
   - Port: `5432` (default)
   - Set a password for the `postgres` user (remember this!)
   - Install Stack Builder: No (optional)

**Verify Installation:**
```powershell
psql --version
```

### 2. Install Node.js (if not already installed)
- Download from: https://nodejs.org/
- Choose LTS version
- Verify: `node --version`

---

## Part 2: Create the Database

### 1. Access PostgreSQL Command Line

**Option A: Using psql in PowerShell**
```powershell
psql -U postgres
```
Enter your postgres password when prompted.

**Option B: Using pgAdmin (GUI)**
- Open pgAdmin 4 (installed with PostgreSQL)
- Connect to localhost server
- Enter your password

### 2. Create Database and User

In psql or pgAdmin query tool, run:

```sql
-- Create database
CREATE DATABASE httptrainer;

-- Create dedicated user for the app
CREATE USER httptrainer_user WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE httptrainer TO httptrainer_user;

-- Connect to the new database
\c httptrainer

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO httptrainer_user;
```

### 3. Create Tables

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Progress table for REST API module
CREATE TABLE restapi_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    current_level INTEGER DEFAULT 1,
    completed_levels INTEGER[] DEFAULT '{}',
    points INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_progress_user ON restapi_progress(user_id);
```

### 4. Verify Tables Created

```sql
-- List all tables
\dt

-- Check users table structure
\d users

-- Check progress table structure
\d restapi_progress
```

---

## Part 3: Create Backend Server

### 1. Create Backend Directory

```powershell
# Navigate to your project
cd C:\Users\IOTTC-05\Documents\HTTPTrainer

# Create backend folder
mkdir backend
cd backend
```

### 2. Initialize Node.js Project

```powershell
npm init -y
```

### 3. Install Required Packages

```powershell
npm install express pg bcryptjs jsonwebtoken cors dotenv
npm install --save-dev nodemon
```

**Package Explanation:**
- `express` - Web framework for Node.js
- `pg` - PostgreSQL client for Node.js
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication tokens
- `cors` - Allow cross-origin requests from React app
- `dotenv` - Environment variables management
- `nodemon` - Auto-restart server on changes (dev only)

### 4. Create Environment Configuration

Create `backend/.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=httptrainer
DB_USER=httptrainer_user
DB_PASSWORD=your_secure_password

# Server Configuration
PORT=3001

# JWT Secret (generate a random string)
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Environment
NODE_ENV=development
```

**Important:** Change `DB_PASSWORD` and `JWT_SECRET` to your actual values!

### 5. Create Database Connection File

Create `backend/db.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

module.exports = pool;
```

### 6. Create Authentication Middleware

Create `backend/middleware/auth.js`:

```javascript
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;
```

### 7. Create Authentication Routes

Create `backend/routes/auth.js`:

```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if user already exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, passwordHash]
        );

        const user = result.rows[0];

        // Create initial progress entry
        await pool.query(
            'INSERT INTO restapi_progress (user_id) VALUES ($1)',
            [user.id]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
```

### 8. Create Progress Routes

Create `backend/routes/progress.js`:

```javascript
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

// Get user progress
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT current_level, completed_levels, points FROM restapi_progress WHERE user_id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            // Create initial progress if not exists
            await pool.query(
                'INSERT INTO restapi_progress (user_id) VALUES ($1)',
                [req.user.id]
            );
            return res.json({ current_level: 1, completed_levels: [], points: 0 });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update progress
router.put('/', authenticateToken, async (req, res) => {
    try {
        const { current_level, completed_levels, points } = req.body;

        const result = await pool.query(
            `UPDATE restapi_progress 
             SET current_level = $1, completed_levels = $2, points = $3, updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $4 
             RETURNING *`,
            [current_level, completed_levels, points, req.user.id]
        );

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
```

### 9. Create Main Server File

Create `backend/server.js`:

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
```

### 10. Update package.json Scripts

Edit `backend/package.json` and add scripts:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

### 11. Test the Backend

```powershell
# Start the server
npm run dev
```

You should see:
```
✅ Database connected successfully
🚀 Server running on http://localhost:3001
```

**Test with PowerShell:**

```powershell
# Test health endpoint
Invoke-WebRequest -Uri http://localhost:3001/api/health | Select-Object -ExpandProperty Content

# Test register
$body = @{
    username = "testuser"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3001/api/auth/register -Method POST -Body $body -ContentType "application/json"
```

---

## Part 4: Next Steps - Frontend Integration

After your backend is running, you'll need to:

1. Install axios in frontend: `npm install axios`
2. Create authentication context in React
3. Create Login/Register components
4. Update GameContext to sync with backend
5. Add token storage and API calls

Would you like me to proceed with the frontend integration code?

---

## Troubleshooting

### Database Connection Issues
```powershell
# Check if PostgreSQL is running
Get-Service -Name postgresql*

# Start PostgreSQL if stopped
Start-Service postgresql-x64-15  # (version may vary)
```

### Port Already in Use
If port 3001 is busy, change PORT in `.env` to 3002 or another available port.

### Password Authentication Failed
- Verify password in `.env` matches what you set during PostgreSQL installation
- Check user exists: `psql -U postgres` then `\du`

---

## Security Notes

⚠️ **Important for Production:**
1. Never commit `.env` file to Git
2. Use strong JWT_SECRET (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
3. Use HTTPS in production
4. Add rate limiting for login/register endpoints
5. Use environment variables for all sensitive data

---

## File Structure

After setup, your structure should be:
```
HTTPTrainer/
├── backend/
│   ├── .env
│   ├── package.json
│   ├── server.js
│   ├── db.js
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       └── progress.js
├── src/
├── public/
└── ...
```
