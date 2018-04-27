import * as os from 'os';
import * as path from 'path';
import * as R from 'routing-controllers';
import { Queue } from '../queue/Queue';
import { hash } from '../utils/hash';

@R.JsonController()
export class API {

    constructor(
        private readonly jobs: Queue
    ) {}

    @R.Post('/provision')
    public async requestProvisioning(
        @R.Req() req: Express.Request,
        @R.Body() body: any
    ) {
        const user = req.user!;
        const clientId = user.sub.replace('client@', '');

        if (!body.requirements) {
            throw new R.HttpError(400, 'Body is missing requirements');
        }

        if (!body.wtName) {
            throw new R.HttpError(400, 'Body is missing wtName');
        }
        const requirements = body.requirements;
        const hashedRequirements = hash(requirements);
        const directory = path.join(os.tmpdir(), clientId, body.wtName);
        const s3Path = path.join(clientId, body.wtName);
        this.jobs.publish('provision', {
            directory,
            requirements,
            s3Path
        });
    }
}
