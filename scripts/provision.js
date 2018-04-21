const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

module.exports.Provision = async (req) => {
    try {
        var dir = req.directory;
        console.log("Setting up virtual environment");
        await exec("virtualenv --no-site-packages " + dir).then(console.log("Environment set up"));
        req.requirements.forEach(async element => {
            console.log("Installing " + element);
            var pipStr = element.replace("@", "==");
            try {
                //use venv pip so we don't have to activate
                await exec(dir + "/Scripts/pip install " + pipStr).then(console.log(element + " installed"));
            } catch(err) {
                console.log(err); //TODO improve this error handling
            }
        });
        //TODO remove base python stuff if necessary
        await console.log("Modules installed successfully");
        return { "status" : "success" };

    } catch(err) {
        console.log("Error: " + err);
        return { "status" : "failure", "reason" : err };
    }
};

module.exports.ProvisionTest = () => {
    var request = {
        "directory" : "C:/Users/A/Documents/GitHub/eden/env",
        "requirements" : ["numpy", "matplotlib"]
    };
    console.log(module.exports.Provision(request));
}