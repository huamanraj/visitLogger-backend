import express from 'express';
import dotenv from 'dotenv';
import { Client, Databases, ID, Query } from 'node-appwrite';
import cors from 'cors';
import moment from 'moment';

dotenv.config();


// Initialize Appwrite client
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// API endpoint to track user data (session time removed)
app.post('/track', async (req, res) => {
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

// Tracking script that sends data instantly
app.get('/track.js', async (req, res) => {
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
          body: JSON.stringify(trackingData)
        }).catch(console.error);
      }

      sendTrackingData();
    })();
  `);
});

// Create a new tracking script
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

// Get analytics for a specific script
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

app.get('/analytics/graph/:scriptId', async (req, res) => {
  const { scriptId } = req.params;
  const { days = 1 } = req.query;

  if (!scriptId) {
    return res.status(400).json({ error: 'scriptId is required' });
  }

  try {
    const daysAgo = moment().subtract(days, 'days').toISOString();

    const data = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      [
        Query.equal('scriptId', scriptId),
        Query.orderDesc('$createdAt'),
        Query.greaterThan('$createdAt', daysAgo),
      ]
    );

    // Group by day and count visitors
    const groupedData = data.documents.reduce((acc, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    // Prepare the response with just the day and count of visitors
    const result = Object.keys(groupedData).map(date => ({
      date,
      count: groupedData[date],
    }));

    res.status(200).json({
      graphData: result,
    });
  } catch (error) {
    console.error('Error fetching graph data:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Root endpoint
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
