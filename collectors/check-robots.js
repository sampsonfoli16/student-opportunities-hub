const axios = require('axios');

const site = process.argv[2];
axios
  .get(new URL('/robots.txt', site).href)
  .then(res => console.log(res.data))
  .catch(err => console.log('Error:', err.message));
