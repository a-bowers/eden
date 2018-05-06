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
        await fs.writeFile(path.join(pyDir, pyHelperName), pyFile);

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
    StartPythonServer(name);
    return cb(null, RunPython) //Compiler done, pass the new webtask function back
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

function StartPythonServer(name) {
    const pyDir = path.join(os.tmpdir(), name); //use uuid?
    var options = {
        scriptPath: pyDir,
        pythonOptions: ["-u", "-W ignore"],
        args: [pyDir, port, path.join(pyDir, userScriptName), mainFunctionName]
    };
    var py = new pythonShell(pyHelperName, options);
    py.on('message', (message) => { console.log(message) });
    py.end(function (err, code, signal) {
        if (err) throw err;
        console.log('The exit code was: ' + code);
        console.log('The exit signal was: ' + signal);
        console.log('Server shut down');
    });
}

const pyFile = `
import sys
import imp
from wsgiref.simple_server import make_server # if we really need it, use bjoern

dir = sys.argv[1]
port = int(sys.argv[2])
scriptPath = sys.argv[3]

sys.path.append(dir)
module = imp.load_source("webtaskScript", scriptPath)
mainFunc = getattr(module, sys.argv[4])

def ServeRequest(env, start_response):
    print "Received {0} request".format(env["REQUEST_METHOD"])
    split = str.split(env['HTTP_WT_URL'], '?', 1)
    env['PATH_INFO'] = split[0]
    env['QUERY_STRING'] = split[1]
#   do fancy things

    iterable = None
    try:
        iterable = mainFunc(env, start_response)
        for data in iterable:
            yield data
    finally:
        if hasattr(iterable, 'close'):
            iterable.close()

def StartServer(port):
    print "Starting server"
    httpd = make_server('', port, ServeRequest)
    httpd.serve_forever()

StartServer(port)`;

//This is the new webtask function passed back from the compiler
function RunPython(context, req, res) {
    req.headers['wt-url'] = req.originalUrl;
    var middle = rp("http://127.0.0.1:" + port);
    req.pipe(middle);
    middle.pipe(res);
}