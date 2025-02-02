import express from 'express';
import dotenv from 'dotenv';
import { Client, Databases, ID, Query } from 'node-appwrite';
import cors from 'cors';
import moment from 'moment';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import timeout from 'connect-timeout';

dotenv.config();

// Configure Appwrite client with environment credentials
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

app.use(express.json());
app.options('*', cors());
// Configure CORS and security headers middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // Respond to preflight request
  }
  next();
});


// Global rate limiting configuration - 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to all routes
app.use(limiter);

// Endpoint-specific rate limiting - 10 requests per minute for tracking endpoints
const trackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute
  message: 'Too many tracking requests from this IP, please try again later.'
});

// Security middleware
app.use(helmet()); // Adds various HTTP headers for security

// Request payload validation middleware
const validateInput = (req, res, next) => {
  const { scriptId, userId, ipAddress } = req.body;

  // Basic input validation
  if (scriptId && scriptId.length > 100) return res.status(400).json({ error: 'Invalid scriptId' });
  if (userId && userId.length > 100) return res.status(400).json({ error: 'Invalid userId' });
  if (ipAddress && ipAddress.length > 50) return res.status(400).json({ error: 'Invalid ipAddress' });

  next();
};

// POST /track - Record visitor analytics data
app.post('/track', trackLimiter, validateInput, async (req, res) => {
  let { scriptId, userId, ipAddress, timestamp, userAgent, city, latitude, longitude, pageViews } = req.body;

  if (!scriptId || !userId || !ipAddress || !timestamp || !userAgent) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    latitude = latitude ? latitude.toString() : "0";
    longitude = longitude ? longitude.toString() : "0";
    pageViews = pageViews ? pageViews.toString() : "1";

    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      ID.unique(),
      { scriptId, userId, ipAddress, timestamp, userAgent, city, latitude, longitude, pageViews }
    );

    res.status(200).json({ message: 'Tracking data saved successfully' });
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /track.js - Serve client-side tracking script
app.get('/track.js', trackLimiter, async (req, res) => {
  const { scriptId, userId } = req.query;

  if (!scriptId || !userId) {
    return res.status(400).send("// Missing scriptId or userId");
  }

  res.setHeader("Content-Type", "application/javascript");
  res.send(`
    (function() {
      const scriptId = "${scriptId}";
      const userId = "${userId}";
      const ipAddress = window.location.hostname;
      let locationData = { city: "Unknown", latitude: "0", longitude: "0" };

      async function sendTrackingData() {
        try {
          const response = await fetch("https://ipapi.co/json/");
          const data = await response.json();
          locationData = {
            city: data.city || "Unknown",
            latitude: data.latitude ? data.latitude.toString() : "0",
            longitude: data.longitude ? data.longitude.toString() : "0"
          };
        } catch (error) {
          console.error("Error fetching location:", error);
        }

        const trackingData = {
          scriptId,
          userId,
          ipAddress,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          city: locationData.city,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          pageViews: "1"
        };

        fetch("https://visitloggerbackend.vercel.app/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(trackingData),
          mode: "cors" 
        }).catch(console.error);

      }

      sendTrackingData();
    })();
  `);
});

// POST /script - Generate new tracking script configuration
app.post('/script', async (req, res) => {
  const { userId, scriptName } = req.body;

  if (!userId || !scriptName) {
    return res.status(400).json({ error: 'userId and scriptName are required' });
  }

  try {
    const scriptId = ID.unique();
    const scriptUrl = `https://visitloggerbackend.vercel.app/track.js?scriptId=${scriptId}&userId=${userId}`;

    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SCRIPTS_COLLECTION_ID,
      scriptId,
      { userId, scriptName, scriptId, scriptUrl }
    );

    res.status(200).json({ scriptUrl, scriptId, scriptName, userId });
  } catch (error) {
    console.error('Error creating script:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/:scriptId - Retrieve paginated analytics data
app.get('/analytics/:scriptId', async (req, res) => {
  const { scriptId } = req.params;
  const { page = 1, limit = 10 } = req.query; // Get page & limit from query params, default to 10 per page

  if (!scriptId) {
    return res.status(400).json({ error: 'scriptId is required' });
  }

  try {
    const offset = (page - 1) * limit; // Calculate offset for pagination

    const data = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      [
        Query.equal('scriptId', scriptId),
        Query.orderDesc('$createdAt'), // Sort by latest entries first
        Query.limit(parseInt(limit)), // Fetch only `limit` entries
        Query.offset(parseInt(offset)) // Skip past entries based on page number
      ]
    );

    res.status(200).json({
      documents: data.documents,
      total: data.total, // Total documents for pagination info
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching analytics:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /analytics/graph/:scriptId - Generate time-series analytics data
app.get('/analytics/graph/:scriptId', async (req, res) => {
  const { scriptId } = req.params;
  const days = parseInt(req.query.days) || 5; // Convert to number and default to 5

  if (!scriptId) {
    return res.status(400).json({ error: 'scriptId is required' });
  }

  try {
    // Calculate start date for the period we want to show
    const daysAgo = moment()
      .startOf('day')
      .subtract(days - 1, 'days')
      .toISOString();

    const data = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      [
        Query.equal('scriptId', scriptId),
        Query.orderDesc('$createdAt'),
        Query.greaterThanEqual('$createdAt', daysAgo),
      ]
    );

    // Create an array of all dates in the range
    const dateRange = [];
    for (let i = days - 1; i >= 0; i--) {
      dateRange.push(
        moment().subtract(i, 'days').format('YYYY-MM-DD')
      );
    }

    // Group by day and count visitors
    const groupedData = data.documents.reduce((acc, entry) => {
      const date = moment(entry.timestamp).format('YYYY-MM-DD');
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    // Fill in missing dates with zero counts
    const result = dateRange.map(date => ({
      date,
      count: groupedData[date] || 0,
    }));

    res.status(200).json({
      graphData: result,
    });
  } catch (error) {
    console.error('Error fetching graph data:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / - Health check and documentation endpoint
app.get('/', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Visit Logger</title>
      </head>
      <body>
        <h1>Welcome to the Visit Logger Backend!</h1>
        <p>You have reached the home page of the backend.</p>
        <p>For more information, visit my <a href="https://aman-raj.xyz" target="_blank">contact page</a>.</p>
      </body>
    </html>
  `);
});

// Security: Cache control headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Request timeout configuration - 5 seconds
app.use(timeout('5s'));

// Security: JSON payload size limitation - 10KB
app.use(express.json({ limit: '10kb' }));

// Initialize server on specified port
app.listen(port, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
});
