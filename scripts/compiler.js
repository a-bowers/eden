const os = require('os');
const path = require('path');
const net = require('net');
const urljoin = require('url-join');
const md5 = require('md5');
const rp = require('request');
const fs = require('fs-extra');
const streamify = require('streamifier');
const gunzip = require('gunzip-maybe');
const uuid = require('uuid').v4;
const pump = require('pump');
const tar = require('tar-fs');
const pythonShell = require('python-shell');

const port = 3336;
const code = uuid();
const mainFunctionName = "Main";
const pyHelperName = "helper.py";
const userScriptName = "script.py"; //Make sure these two bottom names are maintained by the cli
const requirementsFileName = "requirements.txt";

module.exports.compile = async (options, cb) => {
    const name = options.meta.name;
    const pyDir = path.join(os.tmpdir(), name); //TODO put in subdirectory?
    const webtaskFunction = null;

    try { //set up directory and extract requirements, script, and main function name from options.script
        await fs.ensureDir(pyDir);
        const buffer = Buffer.from(options.script);
        if(buffer.toString('hex', 0, 2) === "1f8b") {
            const scriptStream = streamify.createReadStream(buffer);
            await UnpackArchive(scriptStream, pyDir);
        } else {
            //TODO will have issues if the first multiline is not a requirements list (if not included)
            const regex = /"""\n?([\s\S]*?)"""|'''\n?([\s\S]*)'''/;
            var match = regex.exec(buffer.toString('ascii'));
            await fs.writeFile(path.join(pyDir, requirementsFileName), match[1] === "" ? match[2] : match [1]);
            await fs.writeFile(path.join(pyDir, userScriptName), match.input.substring(match.index + match[0].length));
        }

        if(options.meta.main)
            mainFunctionName = options.meta.main;
        console.log("Main function is " + mainFunctionName);
        const argRegex = new RegExp("(?:def +" + mainFunctionName + " *\\()([\\s\\S]*?)(?:\\):)");
        const argCount = regex.exec(buffer.toString('ascii'))[1].split(',').length; //TODO doesn't count comments or defaults
        console.log("Found " + argCount + " arguments");
        switch(argCount) {
            case 1: //callback
                await fs.writeFile(path.join(pyDir, pyHelperName), pyFileCallback);
                webtaskFunction = RunPythonCallback;
                break;
            case 2: //with context
                await fs.writeFile(path.join(pyDir, pyHelperName), pyFileContext);
                webtaskFunction = RunPythonContext;
                break;
            case 3: //full control
                await fs.writeFile(path.join(pyDir, pyHelperName), pyFileFull);
                webtaskFunction = RunPythonFull;
                break;
            default:
                throw "Improper webtask main function"
        }
    } catch(err) {
        console.log("Setup error: " + err);
    }

    try {
        const requirementsFilePath = path.join(pyDir, requirementsFileName);
        const requirements = await fs.readFile(requirementsFilePath, { encoding: 'ascii' });
        const provisionerurl = urljoin("https://example.com", secrets.CLIENT_ID, name); //TODO URL

        var token = await GetAuthToken(options.secrets)
        .catch((err) => { Promise.reject("Error getting auth token: " + err) });

        const requestData = {
            wtName: name,
            language: 'python',
            dependencyFile: requirements
        }

        const options = {
            url: provisionerurl,
            json: requestData,
            headers: {
                Authorization: 'Bearer ' + token
            }
        }
        const provRes = await GetPythonLibrary(options, pyDir)
        .catch((err) => {
            if(provRes.statusCode && provRes.statusCode === 404) Promise.reject("Provisioning in progress.");
            else Promise.reject("Error starting provisioner: " + err)
        });;
    } catch(err) {
        return cb(err, null) //Provisioning is ongoing or something else went wrong with the s3 call
    }

    return cb(null, webtaskFunction) //Compiler done, pass the new webtask function back
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

async function GetPythonLibrary(options, dest) {
    return new Promise ((resolve, reject) => {
        try {
            rp.post(options, (err, res, body) => {
                if(err) return reject(err);
                if(res.statusCode === 200) {
                    await UnpackArchive(req, dest).then(resolve());
                    return resolve(res);
                }
                return reject(res);
            });
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

//These are the new webtask functions passed back from the compiler, chosen depending on the arguments
function RunPythonFull(context, req, res) {
    const pyDir = path.join(os.tmpdir(), context.meta.name);
    var options = {
        scriptPath: pyDir,
        pythonOptions: ["-u", "-W ignore"],
        args: [pyDir, port, path.join(pyDir, userScriptName), mainFunctionName]
    };
    var py = pythonShell.run(pyHelperName, options, (err) => {
        if(err) {
            console.log("Python error: " + err);
            //res.writeHead(444, "Python error");
            res.end(err);
        }
    });
    py.on('message', (message) => { 
        console.log(message) 
        if(message === "Ready") {
            var middle = rp("http://127.0.0.1:" + port);
            req.pipe(middle);
            middle.pipe(res);
        }
    });
}

const pyFileFull = `
import sys
import imp
from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler

dir = sys.argv[1]
port = int(sys.argv[2])
scriptPath = sys.argv[3]

sys.path.append(dir)
module = imp.load_source("script", scriptPath)

class Handlers(BaseHTTPRequestHandler):
    def do_POST(self):
        print "Received POST request"
        content_length = int(self.headers['Content-Length']) # Gets the size of data
        print "Data length is {}".format(content_length)
#        post_data = self.rfile.read(content_length) # Gets the data
        print "Calling main function"
        res = getattr(module, sys.argv[4])()#(post_data)
        print "Done main function"
#        self.send_response(200)
#        self.end_headers()
        self.wfile.write(res)

def StartServer(port):
    print "Starting server"
    address = ('', port)
    httpd = HTTPServer(address, Handlers)
    print "Ready"
    httpd.serve_forever()

StartServer(port)`;

function RunPythonContext(context, cb) {
    const pyDir = path.join(os.tmpdir(), context.meta.name);
    var options = {
        scriptPath: pyDir,
        pythonOptions: ["-u", "-W ignore"],
        args: [pyDir, port, path.join(pyDir, userScriptName), mainFunctionName, code]
    };
    var py = pythonShell.run(pyHelperName, options, (err) => {
        if(err) return cb(err);
    });
    py.on('message', (message) => { 
        console.log(message);
        if(message.startsWith(code)) {
            return cb(null, message.substring(128));
        }
    });
    py.send(context, { mode: json });
}

//TODO context sending doesn't work (crash with write after end (async))
const pyFileContext = `
import sys
import imp

dir = sys.argv[1]
port = sys.argv[2]
scriptPath = sys.argv[3]
code = sys.argv[5]

sys.path.append(dir)
module = imp.load_source("script", scriptPath)

context = sys.stdin.read()

def Callback(err, data=None):
    if data is None: #err is not None instead?
        sys.stderr.write(err)
    else:
        print code + data
    sys.exit()

getattr(module, sys.argv[4])(context, Callback)`;

function RunPythonCallback(cb) {
    const pyDir = path.join(os.tmpdir(), context.meta.name); //TODO THERE IS NO CONTEXT!
    var options = {
        scriptPath: pyDir,
        pythonOptions: ["-u", "-W ignore"],
        args: [pyDir, port, path.join(pyDir, userScriptName), mainFunctionName, code]
    };
    var py = pythonShell.run(pyHelperName, options, (err) => {
        if(err) { return cb(err); }
    });
    py.on('message', (message) => { 
        console.log(message);
        if(message.startsWith(code)) {
            return cb(null, message.substring(128));
        }
    });
}

const pyFileCallback = `
import sys
import imp

dir = sys.argv[1]
port = sys.argv[2]
scriptPath = sys.argv[3]
code = sys.argv[5]

sys.path.append(dir)
module = imp.load_source("script", scriptPath)

def Callback(err, data=None):
    if data is None:
        sys.stderr.write(err)
    else:
        print code + data
    sys.exit()

getattr(module, sys.argv[4])(Callback)`;