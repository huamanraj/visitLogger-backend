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



// API endpoint to track user data
app.post('/track', async (req, res) => {
  const { scriptId, userId, ipAddress, timestamp, userAgent, timeSpent, city, latitude, longitude } = req.body;

  if (!scriptId || !userId || !ipAddress || !timestamp || !userAgent || timeSpent === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      ID.unique(),
      { scriptId, userId, ipAddress, timestamp, userAgent, timeSpent, city, latitude, longitude }
    );
    
    res.status(200).json({ message: 'Tracking data saved successfully' });
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});






app.post('/script', async (req, res) => {
  const { userId, scriptName } = req.body;

  if (!userId || !scriptName) {
    return res.status(400).json({ error: 'userId and scriptName are required' });
  }

  try {
    // Generate a unique scriptId
    const scriptId = ID.unique();

    // Generate the tracking script
    const script = `
      <script>
  (function() {
    const scriptId = "<SCRIPT_ID>";
    const userId = "<USER_ID>";
    const ipAddress = window.location.hostname;
    const startTime = Date.now();

    async function getLocation() {
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        return { city: data.city, latitude: data.latitude, longitude: data.longitude };
      } catch (error) {
        console.error("Error fetching location:", error);
        return { city: null, latitude: null, longitude: null };
      }
    }

    window.addEventListener("beforeunload", async function() {
      const endTime = Date.now();
      const timeSpent = (endTime - startTime) / 1000; // Convert ms to seconds
      const { city, latitude, longitude } = await getLocation();

      fetch("https://visitloggerbackend.vercel.app/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          userId,
          ipAddress,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          timeSpent,
          city,
          latitude,
          longitude
        })
      }).catch(console.error);
    });
  })();
</script>

    `;

    // Save script metadata
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SCRIPTS_COLLECTION_ID,
      scriptId,
      { userId, scriptName, scriptId, script }
    );

    // Send the response
    res.status(200).json({ script, scriptId, scriptName, userId });
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