import { join } from "path";
import { platform } from "os";

export async function getGlobParams(directory: string) {
    return {
        cwd: join(directory, (platform() === 'win32') ? "Lib/site-packages" : "lib/python2.7/site-packages"),
        ignore: ["wheel*/**", "pip*/**", "setuptools*/**", "*.dist-info/**"]
    };
}
