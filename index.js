require('dotenv').config(); // Add this line at the top
const express = require('express');
const fetchImage = require('./api/fetch-image');

const app = express();

// Ensure JSON middleware is applied before defining routes
app.use(express.json());

app.post('/fetch-image', fetchImage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
