import * as archiver from 'archiver';
// tslint:disable-next-line:no-submodule-imports
import * as S3 from 'aws-sdk/clients/s3';
import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { createWriteStream, writeFile } from 'fs';
import { ensureDir } from 'fs-extra';
import * as path from 'path';
import { promisify } from 'util';
import env from '../env';
import createLogger from '../logger';
import { Job } from '../queue/Job';

const logger = createLogger('provisioner');
const execAsync = promisify(exec);
const writeFileAsync = promisify(writeFile);
const awsS3 = new S3({
    accessKeyId: env('AWS_ACCESS_KEY_ID'),
    region: 'us-west-2',
    secretAccessKey: env('AWS_ACCESS_KEY')
});

const uploadAsync = promisify(awsS3.upload.bind(awsS3));

async function installModules(directory: string, requirements: string) {
    logger.info("Setting up virtual environment");
    const responseFromSetup = await execAsync(`virtualenv --no-site-packages --always-copy ${directory}`, {
        cwd: directory
    });
    logger.debug("Setting up module finished with", responseFromSetup);
    logger.info("Environment set up");

    const requirementsFilePath = path.join(directory, 'requirements.txt');
    await writeFileAsync(requirementsFilePath, requirements, {
        encoding: 'ascii'
    })

    logger.info("Starting to install modules");
    logger.debug("requirements.txt ->", requirements);
    const responseFromInstall =  await execAsync("pip install -r ../requirements.txt", {
        cwd: directory + "/Scripts"
    });

    logger.debug("installing finished", responseFromInstall);
    logger.info("Modules successfully installed");
}

function zipModules(directory: string) {
    directory = path.join(directory, 'Lib/site-packages');

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

    // Improve this
    arch.glob('**', {
        cwd: directory,
        ignore: [
            'wheel**',
            'pip**',
            'setuptools**',
        ]
    });

    return {
        promise,
        stream: arch,
    };
}

export async function provision(job: Job) {
    try {
        const req = job.metadata;
        const {requirements, directory, s3Path} = req;
        await ensureDir(directory);


        const stream = createWriteStream('tmp.tar.gz');
        try {
            logger.info("Fetching modules");
            await installModules(directory, requirements);
            logger.info("Fetchinc complete starting to zip and upload");
            const arch = zipModules(directory);
            const uploadPromise = uploadAsync(arch.stream);
            await arch.promise;
            logger.debug("Archival Complete");
            await uploadPromise;
            logger.debug("Upload complete");
            logger.info("Provisioning Complete");
        } catch (err) {
            stream.destroy();
            logger.info("Failed to install modules", err);
            return job.failed(err);
        }

        return job.success();

    } catch(err) {
        logger.info("Unexpected Error while provisioning", err);
        return job.failed(err);
    }
};
