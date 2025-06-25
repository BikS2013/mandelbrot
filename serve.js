const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   MANDELBROT SET EXPLORER                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Server running at: http://localhost:${PORT}`);
    console.log('');
    console.log('📋 Instructions:');
    console.log('   • Open your browser and navigate to the URL above');
    console.log('   • Click and drag to zoom into a specific area');
    console.log('   • Use mouse wheel to zoom in/out at cursor position');
    console.log('   • Adjust iterations for more detail (higher = slower)');
    console.log('   • Try different color schemes from the dropdown');
    console.log('   • Click "Save Image" to download the current view');
    console.log('');
    console.log('🛑 To stop the server: Press Ctrl+C');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Server logs:');
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    console.log('Thank you for exploring the Mandelbrot set!');
    process.exit(0);
});