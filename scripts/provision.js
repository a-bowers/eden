const debug = require('debug')('provision');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

module.exports.Provision = async (req) => {
    try {
        var dir = req.directory;
        debug("Setting up virtual environment");
        await exec("virtualenv --no-site-packages " + dir).then(debug("Environment set up"));
        //use venv pip so we don't have to activate
        await exec(path.join(dir, "Scripts/pip") + " install -r " + path.join(dir, "requirements.txt"));
        //TODO remove base python stuff if necessary
        await debug("Modules installed successfully");
        return { "status" : "success" };

    } catch(err) {
        debug("Error: " + err);
        return { "status" : "failure", "reason" : err };
    }
};

module.exports.ProvisionTest = () => {
    var request = {
        "directory" : path.join(os.tmpdir(), "_provisionEnv")
    };
    debug(module.exports.Provision(request));
}