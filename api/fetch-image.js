module.exports = async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`); // Debugging log
    console.log('Request headers:', req.headers); // Log headers for debugging
    console.log('Request body:', req.body); // Log body for debugging
    if (req.method === 'POST') {
        if (!req.body || typeof req.body !== 'object') {
            console.error('Request body is missing or not parsed. Ensure middleware like express.json() is used.');
            res.status(400).send('Bad Request: Missing or invalid request body. Ensure JSON middleware is configured.');
            return;
        }

        const { url } = req.body; // Extract URL from request body

        if (!url) {
            res.status(400).send('Bad Request: URL is required');
            return;
        }

        try {
            // Dynamically import node-fetch
            const fetch = (await import('node-fetch')).default;

            // Validate URL format
            const validUrl = new URL(url);
            if (!['http:', 'https:'].includes(validUrl.protocol)) {
                res.status(400).send('Bad Request: Invalid URL protocol. Only HTTP and HTTPS are supported.');
                return;
            }

            const response = await fetch(url);
            if (!response.ok) {
                const errorBody = await response.text(); // Fetch response body for debugging
                console.error(`Failed to fetch image. Status: ${response.status}, Body: ${errorBody}`);
                res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
                return;
            }

            const imageBuffer = await response.buffer();
            res.setHeader('Content-Type', 'image/jpeg');
            res.status(200).send(imageBuffer);
        } catch (error) {
            if (error instanceof TypeError) {
                res.status(400).send('Bad Request: Invalid URL format');
            } else {
                console.error('Error fetching image:', error); // Log the error
                res.status(500).send('Internal Server Error');
            }
        }
    } else {
        res.status(404).send('Not Found');
    }
};