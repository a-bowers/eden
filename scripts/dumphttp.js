const http = require("http");

const hostname = "127.0.0.1";
const port = 3500;

// Accquired at https://stackoverflow.com/a/46787467/855760
const server = http.createServer((req, res) => {
  console.log(`\n${req.method} ${req.url}`);
  console.log(req.headers);

  req.on("data", function(chunk) {
    console.log(`BODY: (${chunk.length} bytes) ${
        process.env.DUMP_DATA ? chunk.toString() : ''
    }`);
  });

  req.on("Error", (err) => {
    console.log("Error:");
    console.error(err);
  });

  req.on('end', () => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("Ok\n");
  });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
