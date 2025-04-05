const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { createCanvas, registerFont } = require('canvas');
const upload = multer();

module.exports = async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`);
    
    // Validate and load Cloudflare R2 credentials
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        console.error('Missing R2 credentials');
        res.status(500).json({ error: 'R2 credentials are missing' });
        return;
    }

    const r2Client = new S3Client({
        region: 'auto',
        endpoint: 'https://514e56c3c68540ca4fc10652e9a98a5b.r2.cloudflarestorage.com',
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    if (req.method === 'POST') {
        upload.none()(req, res, async (err) => {
            if (err) {
                console.error('Error parsing form data:', err);
                res.status(400).send('Bad Request: Unable to parse form data');
                return;
            }

            const { imageUrl, text, x, y, fontSize, fontColor } = req.body;
            
            console.log('Request body:', req.body);

            if (!imageUrl || !text) {
                res.status(400).json({ error: 'Image URL and text are required' });
                return;
            }

            try {
                // Dynamically import node-fetch
                const fetch = (await import('node-fetch')).default;

                // Validate URL format
                const validUrl = new URL(imageUrl);
                if (!['http:', 'https:'].includes(validUrl.protocol)) {
                    res.status(400).json({ error: 'Invalid URL protocol' });
                    return;
                }

                // Fetch the image
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    res.status(response.status).json({ error: `Failed to fetch image: ${response.statusText}` });
                    return;
                }

                const imageBuffer = await response.buffer();
                
                // Get image dimensions
                const imageMetadata = await sharp(imageBuffer).metadata();
                const imageWidth = imageMetadata.width;
                const imageHeight = imageMetadata.height;

                // Parse parameters with sensible defaults
                const posX = parseInt(x) || 50;
                const posY = parseInt(y) || 150;
                const size = parseInt(fontSize) || 48;
                const color = fontColor || '#FFFFFF'; // Default to white if not provided
                
                console.log('Using parameters:', { posX, posY, size, color, imageWidth, imageHeight });

                // Create a canvas with the same dimensions as the image
                const canvas = createCanvas(imageWidth, imageHeight);
                const ctx = canvas.getContext('2d');
                
                // Clear the canvas with a transparent background
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Set up text properties
                ctx.font = `bold ${size}px Arial, sans-serif`;
                ctx.fillStyle = color;
                ctx.textBaseline = 'top';
                
                // Add stroke for better visibility against various backgrounds
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeText(text, posX, posY);
                
                // Draw the text
                ctx.fillText(text, posX, posY);
                
                // Convert canvas to buffer
                const textBuffer = await canvas.toBuffer('image/png');
                
                console.log('Text overlay created, size:', textBuffer.length);

                // Composite the text image onto the original image
                const processedImage = await sharp(imageBuffer)
                    .composite([{
                        input: textBuffer,
                        top: 0,
                        left: 0
                    }])
                    .jpeg({ quality: 90 })
                    .toBuffer();

                // Upload to R2
                const objectKey = `text-images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                const bucketName = 'public-images';
                
                await r2Client.send(new PutObjectCommand({
                    Bucket: bucketName,
                    Key: objectKey,
                    Body: processedImage,
                    ContentType: 'image/jpeg',
                }));

                res.status(200).json({
                    message: 'Image processed successfully',
                    r2Url: `https://cdn-public.wrappedbot.com/${objectKey}`,
                });
            } catch (error) {
                console.error('Error processing image:', error);
                res.status(500).json({ error: 'Failed to process image', details: error.message });
            }
        });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};