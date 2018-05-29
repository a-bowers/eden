import * as archiver from "archiver";
import { exec } from "child_process";
import * as chokidar from "chokidar";
import { createWriteStream, writeFile, createReadStream } from "fs";
import { ensureDir } from "fs-extra";
import { tmpdir } from "os";
import * as path from "path";
import * as request from "request-promise";
import { promisify } from "util";
import env from "../env";
import createLogger from "../logger";
import { loadLanguage } from "./language";
import { PassThrough } from "stream";

const logger = createLogger("provisioner");
const execAsync = promisify(exec);
const writeFileAsync = promisify(writeFile);

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

    const promise = new Promise((resolve, reject) => {
        arch.on("warning", err => {
            if (err.code === "ENOENT") {
                logger.warn(`while archiving, ${directory}`, err);
                return;
            }
            reject(err);
        });
        arch.on("error", reject);
        arch.on("finish", () => resolve(true));
    });

    // Improve this
    arch.glob("**", await lang.getGlobParams(directory, dependencyFile));

    const passThrough = new PassThrough();
    arch.pipe(passThrough);

    arch.finalize();

    return {
        promise,
        stream: passThrough
    };
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
        logger.info("Fetchinc complete starting to zip and upload");
        const arch = await zipModules(language, envUrl, dependencyFile);

        logger.info("Utilizing the amazon service");

        const { url, fields } = form;

        logger.info("Form", fields);

        const formData = {
            ...fields,
            file: {
                options: {
                    contentType: "text/plain",
                    filename: "hello"
                },
                value: arch.stream
            }
        };

        const r = request.post({
            formData,
            url
        });

        logger.info("Archive for the upload to complete");
        await arch.promise;

        logger.debug("Archival Complete");
        await r;
        logger.debug("Upload complete");
        logger.info("Provisioning Complete");

        return true;
    } catch (err) {
        logger.info(err);
        logger.error("Failed to zip and upload modules to s3");
    }
}
