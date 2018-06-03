const os = require('os');
const path = require('path');
const urljoin = require('url-join');
const md5 = require('md5');
const rp = require('request');
const fs = require('fs-extra');
const streamify = require('streamifier');
const uuid = require('uuid').v4;
const ymir = require('ymir');
const webtask = require('webtask-tools');
const tar = require('tar');

const python = ymir.default;
const sys = python.import('sys');

var mainFunctionName = "app";
const userModule = "script";
const userScriptName = `${userModule}.py`; //Make sure these two bottom names are maintained by the cli
const requirementsFileName = "requirements.txt";

module.exports.compile = async (options, cb) => {
    // 
    const name = options.meta.name;
    const pyDir = path.join(os.tmpdir(), name);
    const test = options.meta.test;

    console.log(pyDir);

    try { //set up directory and extract requirements, script, and main function name from options.script
        await fs.ensureDir(pyDir);
        //await fs.writeFile(path.join(pyDir, "webtaskContext.json"), JSON.stringify(_objectWithoutProperties(options, ["script"])));

        const buffer = Buffer.from(options.script);
        //if(buffer.toString('hex', 0, 2) === "1f8b") {
        if(isGzip(buffer)) {
            const scriptStream = streamify.createReadStream(buffer);
            await UnpackArchive(scriptStream, pyDir);
        } else {
            //TODO will have issues if the first multiline is not a requirements list (if not included)
            const regex = /"""\n?([\s\S]*?)"""|'''\n?([\s\S]*)'''/;
            var match = regex.exec(buffer.toString('ascii'));
            await fs.writeFile(path.join(pyDir, requirementsFileName), match[1] === "" ? match[2] : match [1]);
            await fs.writeFile(path.join(pyDir, userScriptName), match.input.substring(match.index + match[0].length));
        }

        if(options.meta.main) {
            mainFunctionName = options.meta.main;
        }

    } catch(err) {
        return cb(err, null);
    }

    try {
        const requirementsFilePath = path.join(pyDir, requirementsFileName);
        const requirements = await fs.readFile(requirementsFilePath, { encoding: 'ascii' });
        var u = test ? "http://localhost:3000/modules" : "https://example.com";
        //const provisionerurl = urljoin(u, options.secrets.CLIENT_ID, name); //TODO URL
        const provisionerurl = urljoin(u, "GaYHHN4KcoElIviUvyWfjhDqbFw29bo2", name);
        
        var token = (await GetAuthToken(options.secrets)).access_token;
        
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
        return cb(err, null) //Provisioning is ongoing or something else went wrong with the s3 call
    }

    sys.path.append(pyDir);

    const scriptFileNameFull = `${userModule}:${mainFunctionName}`;
    const RunPython = webtask.fromExpress(ymir.middleware(scriptFileNameFull));

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

function _objectWithoutProperties(obj, keys) { 
    var target = {};
    for (var i in obj) {
        if (keys.indexOf(i) >= 0) continue;
        if (!Object.prototype.hasOwnProperty.call(obj, i)) continue;
        target[i] = obj[i];
    }
    return target;
}

function isGzip(buf) {
	if (!buf || buf.length < 3) {
		return false;
	}

	return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
};