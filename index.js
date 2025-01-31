import express from 'express';
import dotenv from 'dotenv';
import { Client, Databases, ID, Query } from 'node-appwrite';
import cors from 'cors';


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



// API endpoint to track user data
app.post('/track', async (req, res) => {
  let { scriptId, userId, ipAddress, timestamp, userAgent, timeSpent, city, latitude, longitude, pageViews } = req.body;

  if (!scriptId || !userId || !ipAddress || !timestamp || !userAgent || timeSpent === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    timeSpent = timeSpent ? timeSpent.toString() : "0";
    latitude = latitude ? latitude.toString() : "0";
    longitude = longitude ? longitude.toString() : "0";
    pageViews = pageViews ? pageViews.toString() : "1"; // Handle pageViews

    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      ID.unique(),
      {
        scriptId,
        userId,
        ipAddress,
        timestamp,
        userAgent,
        timeSpent,
        city,
        latitude,
        longitude,
        pageViews 
      }
    );

    res.status(200).json({ message: 'Tracking data saved successfully' });
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




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
      const startTime = Date.now();
      let locationData = { city: "Unknown", latitude: "0", longitude: "0" };
      let pageViews = 1; // Initialize pageViews

      // Fetch location data immediately when script loads
      async function initializeLocation() {
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
      }

      // Initialize location data when script loads
      initializeLocation();

      window.addEventListener("beforeunload", function() {
        const endTime = Date.now();
        const timeSpent = ((endTime - startTime) / 1000).toFixed(2);

        const data = {
          scriptId,
          userId,
          ipAddress,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          timeSpent: timeSpent.toString(),
          city: locationData.city,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          pageViews: pageViews.toString() // Add pageViews to the data
        };

        navigator.sendBeacon(
          "https://visitloggerbackend.vercel.app/track",
          JSON.stringify(data)
        );
      });
    })();
  `);
});





app.post('/script', async (req, res) => {
  const { userId, scriptName } = req.body;

  if (!userId || !scriptName) {
    return res.status(400).json({ error: 'userId and scriptName are required' });
  }

  try {


    // Generate a unique scriptId
    const scriptId = ID.unique();

    // Generate the script URL
    const scriptUrl = `https://visitloggerbackend.vercel.app/track.js?scriptId=${scriptId}&userId=${userId}`;



    // Save script metadata in Appwrite
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SCRIPTS_COLLECTION_ID,
      scriptId,
      { userId, scriptName, scriptId, scriptUrl }
    );

    // Send the response with script URL
    res.status(200).json({ scriptUrl, scriptId, scriptName, userId });
  } catch (error) {
    console.error('Error creating script:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Get analytics for a specific script
app.get('/analytics/:scriptId', async (req, res) => {
  const { scriptId } = req.params;

  if (!scriptId) {
    return res.status(400).json({ error: 'scriptId is required' });
  }

  try {
    const data = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      [Query.equal('scriptId', scriptId)]
    );

    if (data.documents.length === 0) {
      return res.status(404).json({ message: 'No data found for the given scriptId' });
    }

    res.status(200).json(data.documents);
  } catch (error) {
    console.error('Error fetching analytics:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});



app.get('/', async (req, res) => {

  // Send a simple HTML response
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
        <p>You have reached the home page of the backend. This is just a simple message.</p>
                <p>For more information, visit my <a href="https://aman-raj.xyz" target="_blank">contact page</a>.</p>

      </body>
    </html>
  `);
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});