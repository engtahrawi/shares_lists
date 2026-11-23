'use strict';
// Copies the shared interface from the Android app into the desktop app before running or packaging.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'savemind', 'src', 'main', 'assets', 'web');
const dest = path.join(__dirname, '..', 'web');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied interface to', dest);
