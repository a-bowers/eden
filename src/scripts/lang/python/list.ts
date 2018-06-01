import { join } from "path";

export async function getGlobParams(directory: string) {
    return {
        cwd: join(directory, "Lib/site-packages"),
        ignore: ["wheel*/**", "pip*/**", "setuptools*/**", "*.dist-info/**"]
    };
}
