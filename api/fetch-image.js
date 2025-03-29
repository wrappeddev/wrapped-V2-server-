const fetch = require('node-fetch');

module.exports = async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`); // Debugging log
    if (req.method === 'GET') {
        const discordCdnUrl = 'https://cdn.discordapp.com/path-to-your-image.jpg'; // Replace with the actual Discord CDN URL

        try {
            const response = await fetch(discordCdnUrl);
            if (!response.ok) {
                res.status(response.status).send('Failed to fetch image from Discord CDN');
                return;
            }

            const imageBuffer = await response.buffer();
            res.setHeader('Content-Type', 'image/jpeg');
            res.status(200).send(imageBuffer);
        } catch (error) {
            console.error('Error fetching image:', error); // Log the error
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.status(404).send('Not Found');
    }
};