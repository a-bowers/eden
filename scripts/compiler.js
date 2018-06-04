const os = require('os');
const path = require('path');
const urljoin = require('url-join');
const md5 = require('md5');
const rp = require('request');
const fs = require('fs-extra');
const streamify = require('streamifier');
const webtask = require('webtask-tools');
const tar = require('tar');

const ymir = require('ymir');
const python = ymir.default;
const sys = python.import('sys');

var mainFunctionName = "app";
const pyContextName = "webtaskContext.json";
const userModule = "script"; //Make sure these three bottom names are maintained by the CLI/user
const userScriptFileName = `${userModule}.py`;
const requirementsFileName = "requirements.txt";

module.exports.compile = async (options, cb) => {

    const name = options.meta.name;
    const pyDir = path.join(os.tmpdir(), name);
    const localTest = options.meta.test;
    const secrets = options.secrets;
    if(options.meta.main) {
        mainFunctionName = options.meta.main;
    }

    try { //set up directory and extract requirements and script from options.script
        await fs.ensureDir(pyDir);
        await fs.writeFile(path.join(pyDir, pyContextName), pyContext);

        const buffer = Buffer.from(options.script);
        if(isGzip(buffer)) {
            const scriptStream = streamify.createReadStream(buffer);
            await extract(scriptStream, pyDir);
        } else {
            //TODO will have issues if the first multiline is not a requirements list (if not included)
            const regex = /"""\n?([\s\S]*?)"""|'''\n?([\s\S]*)'''/;
            var match = regex.exec(buffer.toString('ascii'));
            await fs.writeFile(path.join(pyDir, requirementsFileName), match[1] === "" ? match[2] : match [1]);
            await fs.writeFile(path.join(pyDir, userScriptFileName), match.input.substring(match.index + match[0].length));
        }
    } catch(err) {
        console.log(JSON.stringify(err)); //TODO make nice error saying the requirements extraction failed
        return cb(err, null);
    }

    try {
        const requirementsFilePath = path.join(pyDir, requirementsFileName);
        const requirements = await fs.readFile(requirementsFilePath, { encoding: 'ascii' });
        var url = localTest ? "http://localhost:3000/modules" : urljoin("https://", secrets.AWS_S3_BUCKET, secrets.S3_PATH_PREFIX);
        const provisionerurl = urljoin(url, secrets.CLIENT_ID, name);
        
        var token = (await GetAuthToken(secrets)).access_token;
        
        const requestData = {
            wtName: name,
            language: 'python',
            dependencyFile: requirements
        }

        const libOptions = {
            url: provisionerurl,
            json: requestData,
            headers: {
                Authorization: 'Bearer ' + token
            },
            followAllRedirects: true,
            followRedirect: function(statusCode) {
                return true;
            }
        };

        if (!await Provision(libOptions, pyDir)) {
            return cb(new Error('Please wait modules are still provisioning'));
        }
    } catch(err) {
        return cb(err, null) //Something else went wrong with the s3 call
    }

    sys.path.append(pyDir);

    const appNameFull = `${userModule}:${mainFunctionName}`;
    const RunPython = webtask.fromExpress(ymir.middleware(appNameFull));

    return cb(null, RunPython) //Compiler done, pass the new webtask function back
};


function extract(request, dest) {
    return new Promise((resolve, reject) => {
        const ext = tar.extract({
            gzip: true,
            cwd: dest// alias for cwd:'some-dir', also ok
        });
    
        request.pipe(ext);
        ext.on('finish', () => resolve(true));
        ext.on('error', reject);    
    });
}

function Provision(options, dest) {
    return new Promise ((resolve, reject) => {
        const r = rp.post(options);

        const t = extract(r, dest);

        r.on('error', reject);
        r.on('response', async (res) => {
            if (res.statusCode === 201) {
                return resolve(false);
            }
            
            if (res.statusCode === 200) {
                return resolve(t);
            }
            return reject(res);
        });
    });
}

function GetAuthToken(secrets) {
    return new Promise ((resolve, reject) => {
        var options = {
            url: urljoin("https://", secrets.AUTH0_DOMAIN, "/oauth/token"),
            headers: { "content-type": "application/json" },
            body: {
                grant_type: "client_credentials",
                client_id: secrets.CLIENT_ID,
                client_secret: secrets.CLIENT_SECRET,
                audience: secrets.AUTH0_AUDIENCE
            },
            json: true
        };

        rp.post(options, (err, res, body) => {
            if(err) return reject(err);
            resolve(body);
        });
    });
}

function isGzip(buf) {
	if (!buf || buf.length < 3) {
		return false;
    }

	return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08; //Third byte signifies DEFLATE
};

const pyContext = `
import os
import json

context = None

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '${pyContextName}')) as f:
    context = json.loads(f.read())`;