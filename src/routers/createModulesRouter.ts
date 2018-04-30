import createPermissionChecker from 'connect-ensure-permissions';
import { NextFunction, Request, Response, Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import { instance as db } from '../db';
import { HttpError } from '../error/HttpError';
import { Module } from '../models/Module';
import { Queue } from '../queue/Queue';
import s3 from '../s3';
import { hash } from '../utils/hash';

const CLIENT_PADDING = '@clients';

export default function createUserRouter(jobs: Queue) {
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

        const {dependencyFile, language} = body;

        // @TODO: Improve this
        const hashedRequirements = hash(dependencyFile);

        const transaction = await db.transaction();

        const mod = await Module.getByClientAndName(clientId, wtName, transaction);

        if (!mod) {
            // Strat provisioning;
            return;
        }

        if (mod.dependencyFileHash === hashedRequirements) {
            // Redirect to S3 with provisioned url
            return;
        }


        const directory = path.join(os.tmpdir(), clientId, body.wtName);
        const s3Path = path.join(clientId, body.wtName);

        const jobId = await jobs.publish('provision', {
            dependencyFile,
            directory,
            language,
            s3Path,
        });

        res.status(201).end('Created');
    }

    router.post('/modules/:clientId/:wtName', requires('provision:modules'), provisionModule);

    return router;
}

