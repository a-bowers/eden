const os = require('os');
const path = require('path');
const net = require('net');
const urljoin = require('url-join');
const md5 = require('md5');
const rp = require('request');
const fs = require('fs-extra');
const streamify = require('streamifier');
const gunzip = require('gunzip-maybe');
const pump = require('pump');
const tar = require('tar-fs');
const pythonShell = require('python-shell');

const pyHelperName = "helper.py";
const userScriptName = "script.py"; //Make sure these two names are maintained by the cli
const requirementsFileName = "requirements.txt";

module.exports.compile = async (options, cb) => {
    const name = options.meta.name;
    const pyDir = path.join(os.tmpdir(), name);

    try { //set up directory and extract reqs and script from options.script
        await fs.ensureDir(pyDir);
        await fs.writeFile(path.join(pyDir, pyHelperName), pyFile);
        const buffer = Buffer.from(options.script);
        if(buffer.toString('hex', 0, 2) === "1f8b") {
            const scriptStream = streamify.createReadStream(buffer);
            await UnpackArchive(scriptStream, pyDir);
        } else {
            //will have issues if the first multiline is not a requirements list (if not included)
            const regex = /"""\n?([\s\S]*?)"""|'''\n?([\s\S]*)'''/;
            var match = regex.exec(buffer.toString('ascii'));
            await fs.writeFile(path.join(pyDir, requirementsFileName), match[1] === "" ? match[2] : match [1]);
            await fs.writeFile(path.join(pyDir, userScriptName), match.input.substring(match.index + match[0].length));
        }
    } catch(err) {
        console.log("Setup error: " + err);
    }
    
    try{
        const requirementsFilePath = path.join(pyDir, requirementsFileName);
        const requirements = await fs.readFile(requirementsFilePath, { encoding: 'ascii' });
        const provisionerurl = urljoin("https://example.com", secrets.CLIENT_ID, name, md5(requirements)); //TODO URL

        try {
            await GetPythonLibrary(provisionerurl, pyDir);
        } catch(err) {
            if(err === 404){ //no archive, call the provisioner
                var token = await GetAuthToken(options.secrets)
                .catch((err) => { Promise.reject("Error getting auth token: " + err) });
                
                const requestData = {
                    wtName: name,
                    lang: 'python',
                    requirements: requirements
                }
            
                const options = { 
                    url: provisionerurl,
                    json: requestData,
                    headers: {
                        Authorization: 'Bearer ' + token
                    }
                }
                var provRes = await PostToProvisioner(options)
                .catch((err) => { Promise.reject("Error starting provisioner: " + err) });

                return cb("Provisioning; \n" + provRes, null); //provisioning is started, error out
            }
            return cb(err, null) //Provisioning is ongoing or something else went wrong with the s3 call
        }

        return cb(null, RunPython) //Compiler done, pass the new webtask function back

    } catch(err) {
        fs.remove(pyDir).catch((err) => reject("Error setting up python: " + err));
        console.log("Error: " + err);
    }
};

function UnpackArchive(srcStream, dest) {
    return new Promise((resolve, reject) => {
        const untar = tar.extract(dest);
        const unzip = gunzip();

        pump(srcStream, unzip, untar, (err) => {
            if(err) {
                reject("Error unpacking: " + err);
            } else {
                resolve();
            }
        });
    });
}

function GetPythonLibrary(url, dest) {
    return new Promise ((resolve, reject) => {
        var options = {
            url: url
        }

        try {
            rp(options).on('response', async (response) => {
                if(response.statusCode === 200) return;
                throw(response.statusCode);
            });
            UnpackArchive(req, dest).then(resolve());
        } catch(err) {
            reject(err);
        }
    });
}

function GetAuthToken(secrets) {
    return new Promise ((resolve, reject) => {
        var options = {
            url: urljoin("https://", secrets.AUTH_DOMAIN, "/oauth/token"),
            headers: { "content-type": "application/json" },
            body: {
                grant_type: "client_credentials",
                client_id: secrets.CLIENT_ID,
                client_secret: secrets.CLIENT_SECRET,
                audience: secrets.API_ID
            },
            json: true
        };

        rp.post(options, (err, res, body) => {
            if(err) return reject(err);
            resolve(body);
        });
    });
}

function PostToProvisioner(options) {
    return new Promise ((resolve, reject) => {
        rp.post(options, (err, res, body) => {
            if(err) return reject(err);
            resolve(res);
        });
    });
}

//This is the new webtask fucntion passed back from the compiler
function RunPython(context, req, res) {
    const port = 4589;
    const pyDir = path.join(os.tmpdir(), context.meta.name);
    var options = { 
        scriptPath: pyDir,
        pythonOptions: ["-W ignore"],
        args: [pyDir, port, path.join(pyDir, userScriptName), context.query.main]
    };
    var py = pythonShell.run(pyHelperName, options, (err, results) => {
        if(err) {
            res.writeHead(444, "Python error");
            res.end(err);
        } else {
            res.writeHead(200, "Webtask complete");
            res.end(results);
        }
    });
    py.on('message', (message) => { console.log(message) });
    const sock = net.connect(port);
    req.pipe(sock);
    sock.pipe(res);
}

const pyFile = `
import sys
import imp
import socket

def RunPython(dir, port, scriptPath, mainFunc):
    sys.path.append(dir)
    module = imp.load_source("script", scriptPath)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', port))
    sock.listen(1)
    conn, addr = sock.accept()
    req = ""
    try:
        while True:
            data = conn.recv(4096)
            if not data:
                break
            req += data
        res = getattr(module, mainFunc)(req) if mainFunc else module.Main(req)
        conn.sendall(res)
    finally:
        sock.close()

RunPython(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4])`;