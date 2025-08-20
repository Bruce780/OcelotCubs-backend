require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
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

app.use(cors());
app.use(express.json());

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));

// create HTTP server for Socket.IO
const server = http.createServer(app);

// socket.io setup
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('sendMessage', async (data) => {
    console.log('Message received:', data);

    // Validate before saving
    if (!data.username || !data.message) {
      console.warn("Message missing username or message:", data);
      return;
    }

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
  });
});

// start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
