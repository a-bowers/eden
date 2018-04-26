`
Get https://eden.goph.me/modules/<md5(webtaskUrl)>/<md5(Join(",", Sorted(Uniques(requirements))))>
If 404 Call the EC2 Provisioner with webtaskUrl and the unique requirements.
2.1. The provisioner will respond with the following scenarios
2.1.1. 409 - Provisioning Ongoing.
2.1.2. 304 - Provisioning Complete this points to the location installed on S3.
2.1.3. 400 - Provisioning had failed and the following is the reason.
If S3 Returns a 200 OK expand it in /tmp/ run the shell script and then execute the python code using the shell script.`

const os = require('os');
const path = require('path');
const urljoin = require('url-join');
const md5 = require('md5');
const rp = require('request');
const fs = require('fs-extra');
const streamify = require('streamifier');
const gunzip = require('gunzip-maybe');
const pump = require('pump');
const tar = require('tar-fs');
const pythonShell = require('python-shell');

const pyDirName = "_pyEnv";
const archiveName = "env.zip";
const pyHelperName = "helper.py";
const userScriptName = "script.py"; //Make sure these two names are maintained by the cli
const requirementsFileName = "requirements.txt";

module.exports.compile = async (options, cb) => {
    const pyDir = path.join(os.tmpdir(), pyDirName);
    const archivePath = path.join(pyDir, archiveName);

    try { //set up directory and extract reqs and script from options.script
        await fs.ensureDir(pyDir);
        await fs.writeFile(path.join(pyDir, pyHelperName), pyFile);
        var scriptStream = streamify.createReadStream(Buffer.from(options.script));
        await UnpackArchive(scriptStream, pyDir);
    } catch(err) {
        console.log("Setup error: " + err);
    }
    
    try{ 
        var requirements = await fs.readFile(path.join(pyDir, requirementsFileName));
        const s3url = urljoin("https://eden.goph.me.s3.amazonaws.com/modules/", md5(requirements) + ".tar.gz");
        console.log("Looking for " + s3url);

        try {
            await GetPythonLibrary(s3url, pyDir);
        } catch(err) {
            if(err === 404){//no archive, call the provisioner and wait for code 300
                const provisionerurl = "google.com"; //TODO
                var provRes = rp.post(provisionerurl,
                    { formData: { file: fs.createReadStream(path.join(pyDir, requirementsFileName)) } }
                );
                //await UnpackArchive(res, pyDir);
                return cb("Provisioning; " + provRes, null); //for now we do not wait for response, just error out
            }
            return cb(err, null)
        }

        return cb(null, RunPython) //Pass the new webtask function back

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
        var s3options = {
            url: url,
            rejectUnauthorized: false
        }

        try {
            rp(s3options).on('response', async (response) => {
                if(response.statusCode === 200) return;
                throw(response.statusCode); //something else went wrong with the s3 call
            });
            UnpackArchive(req, dest).then(resolve());
        } catch(err) {
            reject(err);
        }
    });
}

//This is the function passed back as the new webtask from the compiler
function RunPython(context, req, res) {
    return new Promise((resolve, reject) => {
        const pyDir = path.join(os.tmpdir(), pyDirName);
        var options = { 
            scriptPath: pyDir, //TODO Hash for user script name?
            pythonOptions: ["-W ignore"],
            args: [pyDir, path.join(pyDir, userScriptName)] //TODO add ability to add system args
        };
        var py = pythonShell.run(pyHelperName, options, (err) => {
            reject("Python error: " + err);
        });
        py.on('message', (message) => { console.log(message) });
        py.on('error', (err) => { reject("Python error: " + err); });
        py.on('close', resolve);
    });
}

const pyFile = //TODO call correct user script function
`import sys
import imp

def RunPython(dir, scriptPath):
    sys.path.append(dir)
    module = imp.load_source("script", scriptPath)
    module.Main()

RunPython(sys.argv[1], sys.argv[2])`;