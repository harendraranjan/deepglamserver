// server/server.js
const http = require("http");
const app = require("./app");



const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
app.use('/api/upload', require('./routes/upload.routes'));

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
