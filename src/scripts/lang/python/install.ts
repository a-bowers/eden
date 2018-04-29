import { exec } from 'child_process';
import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(writeFile);
const execAsync = promisify(exec);

export async function setup(directory: string) {
    return execAsync(`virtualenv --no-site-packages --always-copy .`, {
        cwd: directory
    });
}

export async function install(directory: string, dependencyFile: string) {
    const requirementsFilePath = join(directory, 'requirements.txt');
    await writeFileAsync(requirementsFilePath, dependencyFile, {
        encoding: 'utf8'
    });
    return execAsync(`pip install -r ../requirements.txt`, {
        cwd: join(directory, 'Scripts'),
    });
}
