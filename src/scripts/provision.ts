import * as archiver from "archiver";
import { exec } from "child_process";
import * as chokidar from "chokidar";
import { createReadStream, createWriteStream } from "fs";
import { ensureDir } from "fs-extra";
import { tmpdir } from "os";
import * as path from "path";
import * as request from "request-promise";
import { promisify } from "util";
import env from "../env";
import createLogger from "../logger";
import { loadLanguage } from "./language";

const logger = createLogger("provisioner");
const execAsync = promisify(exec);

async function installModules(
    language: string,
    directory: string,
    dependencyFile: string
) {
    const lang = loadLanguage(language);

    if (lang.setup) {
        logger.info("Setting up environment");
        const responseFromSetup = await lang.setup(directory, dependencyFile);
        logger.debug("Setting up environment finished with", responseFromSetup);
        logger.info("Environment set up");
    }

    logger.info("Starting to install modules");
    logger.debug("dependencyFile ->", dependencyFile);
    const responseFromInstall = await lang.install(directory, dependencyFile);
    logger.debug("installing finished", responseFromInstall);
    logger.info("Modules successfully installed");
}

async function zipModules(
    language: string,
    directory: string,
    dependencyFile: string
) {
    const lang = loadLanguage(language);
    const arch = archiver("tar", {
        gzip: true,
        gzipOptions: {
            level: 9
        }
    });

    // This is a tad-bit-expensive but we have
    // more RAM than HDD and, I really don't want to
    // setup STS tokens for this stuff or write
    // a streaming uploader for postUrls so.. meh
    // The SSD is acting like a concat stream here
    const archPath = path.join(directory, "archive.tar.gz");
    const promise = new Promise<string>((resolve, reject) => {
        arch.on("warning", err => {
            if (err.code === "ENOENT") {
                logger.warn(`while archiving, ${directory}`, err);
                return;
            }
            reject(err);
        });
        arch.on("error", reject);
        arch.on("finish", () => resolve(archPath));
    });

    // Improve this
    arch.glob("**", await lang.getGlobParams(directory, dependencyFile));
    arch.pipe(createWriteStream(archPath));

    arch.finalize();

    return promise;
}

export async function provision(metadata: any) {
    const { dependencyFile, form, envUrl, language } = metadata;

    await ensureDir(envUrl);

    try {
        logger.info("Fetching modules");
        await installModules(language, envUrl, dependencyFile);
    } catch (err) {
        logger.error("Failed to install modules", err);
        return false;
    }

    try {
        logger.info("Fetching complete starting to zip");
        const arch = await zipModules(language, envUrl, dependencyFile);

        const { url, fields } = form;
        logger.debug("Archival Complete Starting to Upload to ", url);

        const r = request.post({
            formData: {
                ...fields,
                file: createReadStream(arch)
            },
            url // : 'http://localhost:3500',
        });

        // createReadStream(arch).pipe(r);

        await r;
        logger.debug("Upload complete");
        logger.info("Provisioning Complete");

        return true;
    } catch (err) {
        logger.info(err);
        logger.error("Failed to zip and upload modules to s3");
    }
}
