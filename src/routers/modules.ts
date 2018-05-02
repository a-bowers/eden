import createPermissionChecker from 'connect-ensure-permissions';
import { NextFunction, Request, Response, Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import { instance as db } from '../db';
import env from '../env';
import { HttpError } from '../error/HttpError';
import { Module } from '../models/Module';
import queue from '../queue';
import s3 from '../s3';
import { hash } from '../utils/hash';

const CLIENT_PADDING = '@clients';

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

    if (authorizedClientId !== clientId) {
        return next(new HttpError(401));
    }

    if (!body.dependencyFile) {
        return next(new HttpError(400, '`dependencyFile` was not found in body'));
    }

    if (body.language !== 'python') {
        return next(new HttpError(400, `Unsupported language: ${body.language}`));
    }

    const { dependencyFile, language } = body;

    // @TODO: Improve this
    const hashedRequirements = hash(dependencyFile);

    const transaction = await db.transaction();

    let mod = await Module.getByClientAndName(clientId, wtName, transaction);

    if (!mod) {
        // Start provisioning;
        mod = await Module.create(clientId, wtName, transaction);
        return;
    }

    const directory = path.join(os.tmpdir(), clientId, body.wtName);
    const s3Path = path.join(env('S3_PATH_PREFIX'), clientId, body.wtName);
    const s3Options = {
        Bucket: env('AWS_S3_BUCKET'),
        Key: s3Path,
    };

    if (mod.dependencyFileHash === hashedRequirements) {
        // If this is not working please refer to
        // https://stackoverflow.com/questions/38831829/nodejs-aws-sdk-s3-generate-presigned-url
        const url = s3.getSignedUrl('getObject', {
            Expires: env('AWS_GET_EXPIRY'),
            ...s3Options
        });

        return res.redirect(url);
    }

    // We might want a better way to do this
    const putUrl = s3.getSignedUrl('putObject', {
        Expires: env('AWS_POST_EXPIRY'),
        ...s3Options
    });

    const jobId = await queue.publish('provision', {
        dependencyFile,
        envUrl: directory,
        language,
        s3Url: putUrl,
    });

    res.status(201).end('Created');
}

router.post('/modules/:clientId/:wtName', requires('provision:modules'), provisionModule);

export default router;


