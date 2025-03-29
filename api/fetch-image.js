const fetch = require('node-fetch');

module.exports = async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`); // Debugging log
    if (req.method === 'POST') {
        const { url } = req.body; // Extract URL from request body

        if (!url) {
            res.status(400).send('Bad Request: URL is required');
            return;
        }

        try {
            // Validate URL format
            const validUrl = new URL(url);
            if (!['http:', 'https:'].includes(validUrl.protocol)) {
                res.status(400).send('Bad Request: Invalid URL protocol. Only HTTP and HTTPS are supported.');
                return;
            }

            const response = await fetch(url);
            if (!response.ok) {
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