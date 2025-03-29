const express = require('express');
const fetchImage = require('./api/fetch-image');

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

app.post('/fetch-image', fetchImage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
