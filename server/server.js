require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 5000;
const originString = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const ALLOWED_ORIGINS = originString.split(',').map(origin => origin.trim());
const BACKUP_PATH = path.join(__dirname, 'customers-backup.json');
const LOG_FILE = path.join(__dirname, 'server.log');

let customers = [];

// Load backup if exists
if (fs.existsSync(BACKUP_PATH)) {
  try {
    customers = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));
  } catch (e) {
    customers = [];
  }
}

// Backup every hour
setInterval(() => {
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(customers, null, 2));
}, 60 * 60 * 1000);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Socket.io setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'Socket connected' });
});

// GET /customers (with pagination, sorting, and suspicious activity logging)
app.get('/customers', (req, res) => {
  try {
    let { page = 1, limit = 10, sort = 'name', order = 'asc', search = '', filterBy = 'global' } = req.query;
    
    let requestedPage = parseInt(page) || 1;
    let requestedLimit = parseInt(limit) || 10;
    let warningMessage = null;

    // --- STEP 1: Always start with the FULL customer list ---
    // This is your "Main Table" (customers array)
    let filteredResults = [...customers]; 

    // --- STEP 2: Filter the FULL list based on Search ---
    if (search) {
      const searchTerm = search.toString().toLowerCase().trim();
      
      // We filter the original 'customers' array to find EVERY match in the system
      filteredResults = customers.filter(customer => {
        const name = (customer.name || '').toLowerCase();
        const email = (customer.email || '').toLowerCase();
        const phone = (customer.phone || '').toString();

        if (filterBy === 'name') return name.includes(searchTerm);
        if (filterBy === 'email') return email.includes(searchTerm);
        if (filterBy === 'phone') return phone.includes(searchTerm);
        
        // Global wildcard looks across everything in the main table
        return name.includes(searchTerm) || email.includes(searchTerm) || phone.includes(searchTerm);
      });
    }

    // --- STEP 3: Sort ONLY the filtered results ---
    if (['name', 'email', 'phone'].includes(sort)) {
      filteredResults.sort((a, b) => {
        const valA = (a[sort] || '').toString().toLowerCase();
        const valB = (b[sort] || '').toString().toLowerCase();
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // --- STEP 4: Calculate Pagination based on the FILTERED count ---
    const totalRecords = filteredResults.length; // Important: This is the count of matches, not the whole table
    const totalPages = Math.max(1, Math.ceil(totalRecords / requestedLimit));

    // Fix page bounds
    if (requestedPage > totalPages) requestedPage = totalPages;
    if (requestedPage < 1) requestedPage = 1;

    // --- STEP 5: Finally, SLICE the results for the current page ---
    const start = (requestedPage - 1) * requestedLimit;
    const pagedData = filteredResults.slice(start, start + requestedLimit);

    // Final Response
    res.status(200).json({ 
      data: pagedData, 
      meta: { 
        totalRecords, // Matches found
        totalPages, 
        currentPage: requestedPage, 
        limit: requestedLimit 
      }, 
      message: warningMessage 
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /customers with Exception Handling
app.post('/customers', (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Missing fields: name, email, and phone are required.' });
    }
    // . Individual Uniqueness Checks
    const emailExists = customers.some(c => c.email.toLowerCase() === email.toLowerCase().trim());
    const phoneExists = customers.some(c => c.phone === phone.trim());
    if (emailExists) {
      return res.status(409).json({ error: 'Email already exists. Please use a different email address.' });
    }
    if (phoneExists) {
      return res.status(409).json({ error: 'Phone number already exists. Please use a different phone number.' });
    }

    const id = uuidv4();
    const customer = { 
      id, 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      phone: phone.trim() 
    };
    customers.push(customer);
    try {
      io.emit('customer_added', customer);
    } catch (socketErr) {
      console.error("Socket emission failed:", socketErr);
    }
    res.status(201).json(customer);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR in POST /customers:`, error.message);
    
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Something went wrong while saving the customer. Please try again later.' 
    });
  }
});

// DELETE /customers/:id
app.delete('/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Customer ID is required.' });
    }
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: `Customer with ID ${id} does not exist.` 
      });
    }
    const [deleted] = customers.splice(idx, 1);
    try {
      io.emit('customer_deleted', { id: deleted.id });
    } catch (socketErr) {
      console.error("Socket emission failed during deletion:", socketErr);
    }
    res.status(200).json({
      message: 'Customer deleted successfully',
      deletedCustomer: deleted
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR in DELETE /customers/${req.params.id}:`, error.message);
    
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'An unexpected error occurred while deleting the record.' 
    });
  }
});

const logger = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] [${level}] ${message}\n`;
  console.log(formattedMsg.trim());
  fs.appendFile(LOG_FILE, formattedMsg, (err) => {
    if (err) console.error('Failed to write to log file:', err);
  });
};
const logDir = path.join(process.cwd(), 'logs');
const logFileName = 'app.log';
const logFilePath = path.join(logDir, logFileName);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const formatLog = (level, args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    return `[${timestamp}] [${level}] ${message}\n`;
};
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
console.log = (...args) => logStream.write(formatLog('INFO', args));
console.error = (...args) => logStream.write(formatLog('ERROR', args));
console.warn = (...args) => logStream.write(formatLog('WARN', args));
app.get('/api/health', (req, res) => {
    console.log(`Logging to ${req.path} Log file not found at ${logFilePath}`);
    res.json({ status: 'ok', NODE_ENV: process.env.NODE_ENV || 'development' });
});
function tailFile(filePath, lineCount) {
    const STATS = fs.statSync(filePath);
    const FILE_SIZE = STATS.size;
    const BUFFER_SIZE = 1024 * 64; // Read 64KB chunks
    let fd = fs.openSync(filePath, 'r');
    let lines = '';
    let cursor = FILE_SIZE;
    while (lines.split('\n').length <= lineCount && cursor > 0) {
        let length = Math.min(BUFFER_SIZE, cursor);
        cursor -= length;
        let buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, cursor);
        lines = buffer.toString('utf8') + lines;
    }

    fs.closeSync(fd);
    return lines.split('\n').slice(-lineCount).join('\n');
}
app.get('/lastlog', (req, res) => {

    console.log(`Logging to ${req.path}`);
    const offset = parseInt(req.query.offset) || 500;

    if (!fs.existsSync(logFilePath)) {
        fs.mkdirSync(logDir);
        const logStream_NEW = fs.createWriteStream(logFilePath, { flags: 'a' });
        console.log = (...args) => logStream_NEW.write(formatLog('INFO', args));
        console.error = (...args) => logStream_NEW.write(formatLog('ERROR', args));
        console.warn = (...args) => logStream_NEW.write(formatLog('WARN', args));
        return res.status(404).send(`<h1> Log file not found at ${logFilePath}; No log file found yet. under main directory.</h1>`);
    }

    try {
        const lastLines = tailFile(logFilePath, offset);

        res.send(`
            <html>
            <head>
                <title>Log Viewer</title>
                <style>
                    body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; }
                    pre { background: #000; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; }
                    .controls { margin-bottom: 20px; position: sticky; top: 0; background: #1e1e1e; padding: 10px; }
                    button { padding: 10px 20px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 3-px; }
                    button:hover { background: #0056b3; }
                </style>
            </head>
                <body style="background:#121212; color:#00ff00; font-family:monospace; padding:20px;">
                <h2>Last ${offset + 500} Log Entries:</h2>
                    <div style="position:sticky; top:0; background:#222; padding:10px; border-bottom:1px solid #444;">
                        <button onclick="location.reload()">🔄 Refresh (Last 500)</button>
                        <button onclick="location.href='?offset=${offset + 500}'">Load More (Older)⬅️ Previous 500 Lines</button>
                    </div>
                    <pre style="white-space: pre-wrap;">${lastLines}</pre>
                     <script>
                    // Auto-scroll to bottom of logs on load
                    window.scrollTo(0, document.body.scrollHeight);
                </script>
                </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Error reading logs: " + err.message);
    }
});
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  logger(`Server started on port ${PORT}`); 
});
