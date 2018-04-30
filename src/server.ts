import * as BodyParser from 'body-parser';
import * as Express from 'express';
import * as JWT from 'express-jwt';
import * as jwksRsa from 'jwks-rsa';
import { connect } from './db/index';
import env from './env';
import {HttpError} from './error/HttpError';
import createLogger from './logger';
import { Queue } from './queue/Queue';
import createModulesRouter from './routers/createModulesRouter';

const logger = createLogger('server');

export default async function createServer() {
    logger.info(`Creating an application on server`);

    const PORT = parseInt(env('PORT'), 10);
    const HOST = env('HOSTNAME');
    const AUTH0_DOMAIN = env('AUTH0_DOMAIN');
    const AUTH0_AUDIENCE = env('AUTH0_AUDIENCE');

    // Connect to database / kinda sanity check
    await connect();

    const app: Express.Express = Express();
    const jobs = new Queue(env('MAX_WORKERS'));

    const jwtAuthz = JWT({
        algorithms: ['RS256'],

        // Validate the audience and the issuer.
        audience: AUTH0_AUDIENCE,
        issuer: `https://${AUTH0_DOMAIN}`,

        // Dynamically provide a signing key
        // based on the kid in the header and
        // the signing keys provided by the JWKS endpoint.
        secret: jwksRsa.expressJwtSecret({
            cache: true,
            jwksRequestsPerMinute: 5,
            jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
            rateLimit: true,
        })
    });

    app.use(BodyParser.json());
    app.use('/provision', jwtAuthz, createModulesRouter(jobs));

    app.use((err: Error, req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
        if (err instanceof HttpError) {
            const httpError = err as HttpError;
            res.status(httpError.code).json(httpError);
        }
        res.status(500).json({
            code: 500,
            message: 'Internal Server Error'
        });
    });

    logger.info(`Express application trying to listen on ${HOST}:${PORT}`);

    app.listen(PORT, HOST, () => {
        logger.info(`Express application listening on ${HOST}:${PORT}`);
    });

    return app;
}
