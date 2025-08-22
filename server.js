require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Server } = require('socket.io');

// Models
const Chat = require('./model/messages');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Check if MONGO_URI exists
if (!MONGO_URI) {
  console.error("MONGO_URI is missing from .env");
  process.exit(1);
}

// connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// CORS configuration - Define allowed origins
const allowedOrigins = [
  'https://ocelot-cubs-client-side-1.vercel.app', // Your Vercel domain
  'http://localhost:3000', // For development
];

// Apply CORS middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-this', // Add to .env
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 30 * 60 * 1000, // 30 minutes
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // For cross-origin requests
  }
}));

// Session management endpoints
app.post('/api/logout', (req, res) => {
  console.log('Logout request received');
  
  if (req.session) {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Could not log out properly' });
      }
      
      // Clear the session cookie
      res.clearCookie('connect.sid');
      console.log('Session destroyed successfully');
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    res.json({ message: 'No active session' });
  }
});

app.post('/api/heartbeat', (req, res) => {
  if (req.session && req.session.user) {
    // Update session activity
    req.session.lastActivity = new Date().toISOString();
    req.session.touch(); // Refresh session expiry
    
    res.json({ 
      status: 'active',
      lastActivity: req.session.lastActivity
    });
  } else {
    res.status(401).json({ error: 'No active session' });
  }
});

// Check session status endpoint
app.get('/api/session-status', (req, res) => {
  if (req.session && req.session.user) {
    res.json({
      isLoggedIn: true,
      user: req.session.user,
      lastActivity: req.session.lastActivity
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Session creation endpoint (you'll call this from login)
app.post('/api/create-session', (req, res) => {
  const { userId, username } = req.body;
  
  if (!userId || !username) {
    return res.status(400).json({ error: 'Missing user data' });
  }
  
  // Create session
  req.session.user = {
    id: userId,
    username: username,
    loginTime: new Date().toISOString()
  };
  req.session.lastActivity = new Date().toISOString();
  
  console.log('Session created for user:', username);
  res.json({ 
    message: 'Session created successfully',
    sessionId: req.sessionID
  });
});

// Middleware to check if user is authenticated for protected routes
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));

// Root route (to confirm backend is alive)
app.get("/", (req, res) => {
  res.send("Ocelot Cubs backend is running");
});

// create HTTP server for Socket.IO
const server = http.createServer(app);

// socket.io setup with session support
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
});

// Session middleware for Socket.IO
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
});

// Use session middleware with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Access session data
  const session = socket.request.session;
  if (session && session.user) {
    console.log('Authenticated user connected:', session.user.username);
  }

  socket.on('sendMessage', async (data) => {
    console.log('Message received:', data);

    // Validate before saving
    if (!data.username || !data.message) {
      console.warn("Message missing username or message:", data);
      return;
    }

    // Optional: Verify user is authenticated for chat
    // if (!session || !session.user) {
    //   console.warn("Unauthenticated user trying to send message");
    //   return;
    // }

    try {
      // Create timestamp string for consistent format
      const timestampString = data.timestamp || new Date().toLocaleTimeString([], { 
        hour: "2-digit", 
        minute: "2-digit" 
      });

      // Save to database with Date object
      const newMessage = new Chat({
        username: data.username,
        message: data.message,
        timestamp: new Date() // Always use current server time for database
      });

      await newMessage.save();
      console.log('Message saved to database:', newMessage);

      // Emitting to all clients with consistent format 
      const messageToEmit = {
        username: data.username,
        message: data.message,
        timestamp: timestampString // Send as string format
      };

      console.log('Emitting message to all clients:', messageToEmit);
      io.emit('receiveMessage', messageToEmit);

    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Optional: Clean up user session on disconnect
    if (session && session.user) {
      console.log('Authenticated user disconnected:', session.user.username);
    }
  });
});

// Clean up expired sessions periodically
setInterval(() => {
  console.log('Cleaning up expired sessions...');
}, 60 * 60 * 1000); // Every hour

// start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});