import express from 'express';
import dotenv from 'dotenv';
import { Client, Databases, ID, Query } from 'node-appwrite';
import cors from 'cors';

// Load environment variables
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
  const { scriptId, userId, ipAddress, timestamp, userAgent } = req.body;

  if (!scriptId || !userId || !ipAddress || !timestamp || !userAgent) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Save tracking data to Appwrite
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      ID.unique(),
      { scriptId, userId, ipAddress, timestamp, userAgent }
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
          const scriptId = "${scriptId}";
          const userId = "${userId}";
          const ipAddress = window.location.hostname;

          fetch('http://localhost:3000/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              scriptId,
              userId,
              ipAddress,
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent
            })
          })
          .catch(console.error);
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
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});