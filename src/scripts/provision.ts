import * as archiver from 'archiver';
import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { createWriteStream, writeFile } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import createLogger from '../logger';
import { Job } from '../queue/Job';

const logger = createLogger('provisioner');
const execAsync = promisify(exec);
const writeFileAsync = promisify(writeFile);

async function installModules(directory: string, requirements: string) {
    logger.debug("Setting up virtual environment");
    const responseFromSetup = await execAsync(`virtualenv --no-site-packages --always-copy ${directory}`);
    logger.verbose("Setting up module finished with", responseFromSetup);
    logger.debug("Environment set up");

    await writeFileAsync(path.join(directory, 'requirements.txt'), requirements, {
        encoding: 'ascii'
    })

    logger.debug("Starting to install modules");

    logger.verbose("requirements.txt ->", requirements);
    const responseFromInstall =  await execAsync("Scripts/pip install -r requirements.txt", {
        cwd: directory
    });

    logger.verbose("installing finished", responseFromInstall);
    logger.debug("Modules successfully installed");
}

function zipModules(directory: string) {
    directory = path.join(directory, 'lib/site-packages');

    const watcher = chokidar.watch(directory, {
        awaitWriteFinish: {
            pollInterval: 500,
            stabilityThreshold: 2000,
        },
        cwd: directory,
        followSymlinks: false,
    });

    const arch = archiver('tar', {
        zlib: {
            level: 6
        }
    });

    const promise = new Promise((resolve, reject) => {
        arch.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                logger.warn(`while archiving, ${directory}`, err);
                return;
            }
            reject(err);
        });
        arch.on('error', reject);
        arch.on('finish', () => resolve(true));
    });

    watcher.on('add', (filePath) => {
        arch.file(filePath, {});
    });

    promise.finally(() => {
        watcher.close();
    })

    return {
        promise,
        stream: arch,
    };
}

export async function provision(job: Job) {
    try {
        const req = job.metadata;
        const {requirements, directory, s3Path} = req;
        logger.info("Fetching modules");

        const arch = zipModules(directory);
        const stream = createWriteStream('tmp.tar.gz');

        arch.stream.pipe(stream);
        try {
            await installModules(requirements, directory);
            arch.stream.finalize();
        } catch (err) {
            arch.stream.abort();
            stream.destroy();
            logger.debug("Failed to install modules", err);
            return job.failed(err);
        }

        return job.success();

    } catch(err) {
        logger.debug("Unexpected Error while provisioning", err);
        return job.failed(err);
    }
};
