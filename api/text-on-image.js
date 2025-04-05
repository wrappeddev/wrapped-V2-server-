const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
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

                // Create a colored rectangle instead of text (as a fallback)
                // This is a simple visual indicator that will definitely work on Vercel
                const overlay = await sharp({
                    create: {
                        width: Math.min(text.length * size * 0.6, imageWidth - posX),
                        height: size * 1.2,
                        channels: 4,
                        background: { r: 255, g: 255, b: 255, alpha: 0.5 }
                    }
                })
                .png()
                .toBuffer();

                // Composite the overlay onto the original image
                const processedImage = await sharp(imageBuffer)
                    .composite([{
                        input: overlay,
                        top: posY - size,
                        left: posX
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
                    message: 'Image processed with simple overlay',
                    r2Url: `https://cdn-public.wrappedbot.com/${objectKey}`,
                    note: 'Used rectangular overlay as text rendering is not available'
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