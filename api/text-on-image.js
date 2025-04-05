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
                const posY = parseInt(y) || 50;
                const size = parseInt(fontSize) || 48;
                const color = fontColor || '#FFFFFF'; // Default to white if not provided
                
                console.log('Using parameters:', { posX, posY, size, color });

                // Create a text layer with both fill and stroke for visibility
                // Use a more compatible approach for Vercel
                const textSvg = Buffer.from(`
                <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id="outline" x="-20%" y="-20%" width="140%" height="140%">
                      <feMorphology operator="dilate" radius="2" in="SourceAlpha" result="thicken" />
                      <feFlood flood-color="#000000" result="black" />
                      <feComposite in="black" in2="thicken" operator="in" result="outline" />
                      <feMerge>
                        <feMergeNode in="outline" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <text 
                    x="${posX}" 
                    y="${posY}" 
                    font-family="Arial, Helvetica, sans-serif" 
                    font-size="${size}px" 
                    font-weight="bold" 
                    fill="${color}"
                    filter="url(#outline)"
                  >${text}</text>
                </svg>
                `);

                console.log('SVG content:', textSvg.toString());

                try {
                    // Attempt to use the SVG method first
                    const processedImage = await sharp(imageBuffer)
                        .composite([{
                            input: textSvg,
                            gravity: 'northwest'
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
                } catch (svgError) {
                    console.error('SVG approach failed:', svgError);
                    
                    // Fallback to a simpler approach
                    // Create a simple colored rectangle with text as a visual indicator of where text should be
                    const fallbackImageBuffer = await sharp(imageBuffer)
                        .composite([{
                            input: {
                                create: {
                                    width: size * text.length,
                                    height: size * 1.2,
                                    channels: 4,
                                    background: { r: 255, g: 255, b: 255, alpha: 0.7 }
                                }
                            },
                            left: posX,
                            top: posY - size
                        }])
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    
                    // Upload the fallback image
                    const fallbackObjectKey = `text-images/fallback-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                    
                    await r2Client.send(new PutObjectCommand({
                        Bucket: 'public-images',
                        Key: fallbackObjectKey,
                        Body: fallbackImageBuffer,
                        ContentType: 'image/jpeg',
                    }));

                    res.status(200).json({
                        message: 'Image processed with fallback method',
                        r2Url: `https://cdn-public.wrappedbot.com/${fallbackObjectKey}`,
                        note: 'Used fallback method due to SVG rendering issue'
                    });
                }
            } catch (error) {
                console.error('Error processing image:', error);
                res.status(500).json({ error: 'Failed to process image', details: error.message });
            }
        });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};