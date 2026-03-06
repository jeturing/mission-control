// Mission Control - Custom PM2 compatible server
const { execSync } = require('child_process');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const nextPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
require(nextPath);
