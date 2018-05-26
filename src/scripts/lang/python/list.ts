import { join } from "path";

export async function getGlobParams(directory: string) {
    return {
        cwd: join(directory, 'lib/python2.7/site-packages'),
        ignore: [
            'wheel**',
            'pip**',
            'setuptools**',
        ]
    };
}
