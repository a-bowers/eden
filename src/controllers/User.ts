import { Request, Response, Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import { HttpError } from '../error/HttpError';
import { Queue } from '../queue/Queue';
import { hash } from '../utils/hash';


export default function createUserRouter(jobs: Queue) {
    const router: Router = Router();

    router.post('/', async (req: Request, res: Response) => {
        const user = req.user!;
        const clientId = user.sub.replace('client@', '');
        const body = req.body;

        if (!body.requirements) {
            return res.json(new HttpError(400, '`requirements` was not found in body'));
        }

        if (!body.wtName) {
            return res.json(new HttpError(400, '`wtName` was not found in body'));
        }

        if (!body.language) {
            return res.json(new HttpError(400, '`language` was not found in body'));
        }

        if (body.language !== 'python') {
            return res.json(new HttpError(400, `Unsupported 'language' ${body.language}`));
        }

        const requirements = body.requirements;
        const hashedRequirements = hash(requirements);
        const directory = path.join(os.tmpdir(), clientId, body.wtName);
        const s3Path = path.join(clientId, body.wtName);

        await jobs.publish('provision', {
            directory,
            requirements,
            s3Path
        });

        res.status(201).end('Created');
    });

    return router;
}

