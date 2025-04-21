const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);  // Initialize socket.io with the HTTP server

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store sessions with their progress and logs
const sessions = {};

// Progress simulation messages
const loadingMessages = [
  "✅ Step 1: Preparing boost engine...",
  "✅ Step 2: Connecting to TikTok servers...",
  "✅ Step 3: Verifying your link...",
  "✅ Step 4: Sending your request...",
  "✅ Step 5: Finalizing everything..."
];

// Handle the /submit POST request
app.post('/submit', async (req, res) => {
  const { link, sessionId, type } = req.body;

  if (!link || !sessionId || !type) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Initialize session data if it doesn't exist
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      logs: [],
      progress: 0,
      completed: false
    };
  }

  // Clear previous logs and progress for new request
  sessions[sessionId].logs = [];
  sessions[sessionId].progress = 0;
  sessions[sessionId].completed = false;

  // Simulate the process and log each step
  let stepIndex = 0;

  const simulateStep = async () => {
    if (stepIndex < loadingMessages.length) {
      const message = loadingMessages[stepIndex];
      sessions[sessionId].logs.push(message);
      stepIndex++;
      sessions[sessionId].progress += 20; // Simulate progress
      if (sessions[sessionId].progress > 100) sessions[sessionId].progress = 100;

      // Push progress update to client via WebSocket (Socket.IO)
      io.emit('progress', { sessionId, progress: sessions[sessionId].progress, log: message });

      setTimeout(simulateStep, 1000); // Delay next step
    } else {
      // When steps are done, mark the session as complete
      sessions[sessionId].completed = true;
      sessions[sessionId].logs.push("Boost completed successfully!");
      io.emit('progress', { sessionId, progress: 100, log: "Boost completed successfully!" });
      res.json({ message: "Boost request completed!" });
    }
  };

  simulateStep();
});

// Handle the /progress EventSource request
app.get('/progress', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions[sessionId]) {
    return res.status(404).send('Session not found');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send the initial state
  res.write(`data: ${JSON.stringify({ sessionId, progress: sessions[sessionId].progress, log: sessions[sessionId].logs.join("\n") })}\n\n`);

  // Push progress updates
  const intervalId = setInterval(() => {
    if (sessions[sessionId].completed) {
      clearInterval(intervalId);
    }
    res.write(`data: ${JSON.stringify({ sessionId, progress: sessions[sessionId].progress, log: sessions[sessionId].logs.join("\n") })}\n\n`);
  }, 1000);
});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
