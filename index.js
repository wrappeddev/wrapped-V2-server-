require('dotenv').config();
const express = require('express');
const fetchImage = require('./api/fetch-image');
const textOnImage = require('./api/text-on-image');

const app = express();

// Ensure JSON middleware is applied before defining routes
app.use(express.json());

app.post('/fetch-image', fetchImage);
app.post('/text-on-image', textOnImage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
