import createPermissionChecker = require('connect-ensure-permissions');
import { NextFunction, Request, Response, Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import { instance as db } from '../db';
import env from '../env';
import { HttpError } from '../error/HttpError';
import createLogger from '../logger'
import { Module } from '../models/Module';
import queue from '../queue';
import s3 from '../s3';
import { hash } from '../utils/hash';

const CLIENT_PADDING = '@clients';

const logger = createLogger('router:module');
const requires = createPermissionChecker();
const router: Router = Router();
// @TODO move this to utils/tokenUtils
function getClientIDfromSub(sub: string) {
    return sub.replace(CLIENT_PADDING, '');
}

async function provisionModule(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const body = req.body;

    const authorizedClientId = getClientIDfromSub(user.sub);
    const clientId = req.params.clientId;
    const wtName = req.params.wtName;


    logger.info('Handling new request');

    if (authorizedClientId !== clientId) {
        logger.info('Unauthorized request, clientId does not match the expected clientId');
        return next(new HttpError(401));
    }

    if (!body) {
        logger.info('No body was found for request');
        return next(new HttpError(400, 'No body was sent'));
    }

    if (!body.dependencyFile) {
        logger.info('Bad Request, dependencyFile was not found in body');
        return next(new HttpError(400, '`dependencyFile` was not found in body'));
    }

    if (body.language !== 'python') {
        logger.info('Bad Request, invalid langauge specified');
        return next(new HttpError(400, `Unsupported language: ${body.language}`));
    }

    const { dependencyFile, language } = body;

    // @TODO: Improve this
    const hashedRequirements = hash(dependencyFile);

    const transaction = await db.transaction();

    try {
        logger.debug('Checking for Deployed version in Database');
        let mod = await Module.getByClientAndName(clientId, wtName, transaction);
        const envUrl = path.join(os.tmpdir(), clientId, body.wtName);
        const s3Path = path.join(env('S3_PATH_PREFIX'), clientId, body.wtName);
        const s3Options = {
            Bucket: env('AWS_S3_BUCKET'),
            Key: s3Path,
        };

        // Check if module exists and if so,
        // redirect immediately
        if (mod && mod.dependencyFileHash === hashedRequirements) {
            logger.debug('Creating an S3 signed Get URL');
            // If this is not working please refer to
            // https://stackoverflow.com/questions/38831829/nodejs-aws-sdk-s3-generate-presigned-url
            const getUrl = s3.getSignedUrl('getObject', {
                Expires: env('AWS_GET_EXPIRY'),
                ...s3Options
            });

            logger.info('Request redirected to S3');
            return res.redirect(getUrl);
        }

        await transaction.begin();

        // Create a module deployment if we don't have one
        if (!mod) {
            // Start provisioning;
            logger.debug('Deployed version not found, creating new module deployment');
            mod = await Module.create(clientId, wtName, transaction);
            return;
        }

        logger.debug('The current deployed version does not match the requested, queuing new packaging');
        // Create an S3 putUrl
        // @TODO: Inspect what is the best safest time.
        const putUrl = s3.getSignedUrl('putObject', {
            Expires: env('AWS_POST_EXPIRY'),
            ...s3Options
        });

        // Publish a JOB Request
        const jobId = await queue.publish('provision', {
            dependencyFile,
            envUrl,
            language,
            putUrl,
        });

        // @TODO add Job Deployement Request to Module
        transaction.commit();

        logger.info('Created provisioning request');
        return res.status(201).json({
            message: 'Created',
            status: 201
        });
    } catch (err) {
        transaction.rollback();
        logger.error('Error while handling request', err);
        return next(new HttpError(500, 'Unable to provision'));
    } finally {
        transaction.release();
    }
}

router.post('/modules/:clientId/:wtName', requires('provision:modules'), provisionModule);

export default router;


