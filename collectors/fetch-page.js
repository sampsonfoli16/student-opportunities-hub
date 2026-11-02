const axios = require('axios');
const fs = require('fs');

const url = process.argv[2];
axios
  .get(url, {
    headers: { 'User-Agent': 'StudentOpportunitiesHub/0.1 (student project)' }
  })
  .then(res => {
    fs.writeFileSync('data/page.html', res.data);
    console.log('Saved data/page.html,', res.data.length, 'characters');
  })
  .catch(err => console.log('Error:', err.message));
