const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const upload = multer();

module.exports = async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`);
    console.log('Request headers:', req.headers);

    // Validate and load Cloudflare R2 credentials
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        console.error('Missing R2 credentials. Please check your .env file or environment variables.');
        res.status(500).json({ error: 'R2 credentials are missing' }); // Send error response
        return;
    }

    console.log('R2_ACCESS_KEY_ID:', accessKeyId);
    console.log('R2_SECRET_ACCESS_KEY:', secretAccessKey ? 'Loaded' : 'Not Loaded');

    const r2Client = new S3Client({
        region: 'auto',
        endpoint: 'https://514e56c3c68540ca4fc10652e9a98a5b.r2.cloudflarestorage.com',
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    if (req.method === 'POST') {
        // Parse multipart/form-data
        upload.none()(req, res, async (err) => {
            if (err) {
                console.error('Error parsing form data:', err);
                res.status(400).send('Bad Request: Unable to parse form data');
                return;
            }

            const { url, emoji, serverId, botToken, emojiName } = req.body;

            if (!url) {
                res.status(400).send('Bad Request: URL is required');
                return;
            }

            // Check if emoji is true and required parameters are provided
            if (emoji === 'true') {
                if (!serverId) {
                    res.status(400).json({ error: 'Server ID is required when emoji is true' });
                    return;
                }
                if (!botToken) {
                    res.status(400).json({ error: 'Bot token is required when emoji is true' });
                    return;
                }
                if (!emojiName) {
                    res.status(400).json({ error: 'Emoji name is required when emoji is true' });
                    return;
                }
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
                    const errorBody = await response.text();
                    console.error(`Failed to fetch image. Status: ${response.status}, Body: ${errorBody}`);
                    res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
                    return;
                }

                const imageBuffer = await response.buffer();

                // Upload image to Cloudflare R2
                let objectKey;
                if (emoji === 'true') {
                    objectKey = `emoji/${serverId}/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                } else {
                    objectKey = `welcomer/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                }
                
                const bucketName = 'public-images';
                const uploadParams = {
                    Bucket: bucketName,
                    Key: objectKey,
                    Body: imageBuffer,
                    ContentType: emoji === 'true' ? 'image/png' : 'image/jpeg',
                };

                await r2Client.send(new PutObjectCommand(uploadParams));
                const r2Url = `https://cdn-public.wrappedbot.com/${objectKey}`;

                // If emoji is true, upload to Discord
                let discordResponse = null;
                if (emoji === 'true') {
                    try {
                        // Create FormData for Discord API
                        const formData = new FormData();
                        formData.append('name', emojiName);
                        formData.append('image', imageBuffer.toString('base64'));

                        // Upload emoji to Discord
                        const discordApiResponse = await fetch(
                            `https://discord.com/api/v10/guilds/${serverId}/emojis`,
                            {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bot ${botToken}`,
                                },
                                body: formData
                            }
                        );

                        if (!discordApiResponse.ok) {
                            const errorText = await discordApiResponse.text();
                            console.error('Discord API error:', errorText);
                            discordResponse = {
                                success: false,
                                error: `Discord API error: ${discordApiResponse.status} ${discordApiResponse.statusText}`,
                                details: errorText
                            };
                        } else {
                            discordResponse = {
                                success: true,
                                data: await discordApiResponse.json()
                            };
                        }
                    } catch (discordError) {
                        console.error('Error uploading to Discord:', discordError);
                        discordResponse = {
                            success: false,
                            error: 'Failed to upload emoji to Discord',
                            details: discordError.message
                        };
                    }
                }

                res.status(200).json({
                    message: emoji === 'true' ? 'Emoji image processed' : 'Image fetched and uploaded successfully',
                    r2Url,
                    discord: discordResponse
                });
            } catch (error) {
                if (error instanceof TypeError) {
                    res.status(400).send('Bad Request: Invalid URL format');
                } else {
                    console.error('Error fetching or uploading image:', error);
                    res.status(500).send('Internal Server Error');
                }
            }
        });
    } else {
        res.status(404).send('Not Found');
    }
};
