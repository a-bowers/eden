import * as archiver from 'archiver';
// tslint:disable-next-line:no-submodule-imports
import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { createWriteStream, writeFile } from 'fs';
import { ensureDir } from 'fs-extra';
import * as path from 'path';
import { promisify } from 'util';
import env from '../env';
import createLogger from '../logger';
import { Job } from '../queue/Job';
import s3 from '../s3';
import { loadLanguage } from './language';

const logger = createLogger('provisioner');
const execAsync = promisify(exec);
const writeFileAsync = promisify(writeFile);

const uploadAsync = promisify(s3.upload.bind(s3));

async function installModules(language: string, directory: string, dependencyFile: string) {
    const lang = loadLanguage(language);

    if (lang.setup) {
        logger.info("Setting up environment");
        const responseFromSetup = await lang.setup(directory, dependencyFile);
        logger.debug("Setting up environment finished with", responseFromSetup);
        logger.info("Environment set up");
    }

    logger.info("Starting to install modules");
    logger.debug("dependencyFile ->", dependencyFile);
    const responseFromInstall =  await lang.install(directory, dependencyFile);
    logger.debug("installing finished", responseFromInstall);
    logger.info("Modules successfully installed");
}

async function zipModules(language: string, directory: string, dependencyFile: string) {
    const lang = loadLanguage(language);
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
    arch.glob('**', await lang.getGlobParams(directory, dependencyFile));

    return {
        promise,
        stream: arch,
    };
}

export async function provision(job: Job) {
    try {

        const req = job.metadata;
        const {dependencyFile, directory, s3Path, language} = req;
        await ensureDir(directory);

        const stream = createWriteStream('tmp.tar.gz');
        try {
            logger.info("Fetching modules");
            await installModules(language, directory, dependencyFile);
            logger.info("Fetchinc complete starting to zip and upload");
            const arch = await zipModules(language, directory, dependencyFile);
            const uploadPromise = uploadAsync({
                Body: arch.stream,
                Bucket: env('S3_BUCKET_NAME'),
                Key: s3Path
            });
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
