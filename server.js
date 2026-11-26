const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    const base = path.basename(filePath);
    if (base === 'sw.js' || base === 'index.html' || base === 'manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (base === 'manifest.webmanifest') {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    }
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`ReHolz HRIS server listening on http://${HOST}:${PORT}`);
});
