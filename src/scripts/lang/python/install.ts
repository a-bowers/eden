import { exec } from "child_process";
import { writeFile } from "fs";
import { join } from "path";
import { promisify } from "util";
import env from "../../../env";

const writeFileAsync = promisify(writeFile);
const execAsync = promisify(exec);

export async function setup(directory: string) {
    // For those tortured souls with OSX
    const nonSysPython = env("PYTHON_EXE");
    let command = "virtualenv --no-site-packages --always-copy";

    if (nonSysPython) {
        command += ` --python=${nonSysPython}`;
    }

    command += " .";

    return execAsync(command, {
        cwd: directory
    });
}

export async function install(directory: string, dependencyFile: string) {
    const requirementsFilePath = join(directory, "requirements.txt");
    await writeFileAsync(requirementsFilePath, dependencyFile, {
        encoding: "utf8"
    });
    if(process.platform === "win32") {
        return execAsync(`.\\Scripts\\pip install -r .\\requirements.txt`, {
            cwd: join(directory)
        });
    }
    return execAsync(`./bin/pip install -r ./requirements.txt`, {
        cwd: join(directory)
    });
}
