import createPermissionChecker from 'connect-ensure-permissions';
import { NextFunction, Request, Response, Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import { HttpError } from '../error/HttpError';
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

    async function getModuleURL(req: Request, res: Response, next: NextFunction) {
        const user = req.user!;
        const authorizedClientId = getClientIDfromSub(user.sub);
        const clientId = req.params.clientId;
        if (authorizedClientId !== clientId) {
            return next(new HttpError(401));
        }

    }

    async function provisionModule(req: Request, res: Response, next: NextFunction) {
        const user = req.user!;
        const clientId = getClientIDfromSub(user.sub);
        const body = req.body;

        if (!body.dependencyFile) {
            return next(new HttpError(400, '`dependencyFile` was not found in body'));
        }

        if (body.language !== 'python') {
            return next(new HttpError(400, `Unsupported language: ${body.language}`));
        }

        const {dependencyFile, language} = body.requirements;
        // @TODO: Improve this
        const hashedRequirements = hash(dependencyFile);
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

    router.get('/modules/:clientId/:wtName', requires('fetch:modules'), getModuleURL);
    router.post('/modules/:clientId/:wtName', requires('provision:modules'), provisionModule);

    return router;
}

