import * as Express from 'express';
import * as JWT from 'express-jwt';
import * as jwksRsa from 'jwks-rsa';
import env from './env';

const app = Express();

const jwtAuthz = JWT({
    // Dynamically provide a signing key
    // based on the kid in the header and
    // the signing keys provided by the JWKS endpoint.
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${env('AUTH0_DOMAIN')}/.well-known/jwks.json`,
        rateLimit: true,
    }),

    algorithms: ['RS256'],
    // Validate the audience and the issuer.
    audience: env('AUTH0_AUDIENCE'),
    issuer: `https://${env('AUTH0_DOMAIN')}`,
});

async function initialize() {
    // const publisher = await createPublisher();
    // app.use("/api", jwtAuthz, createRoutes(publisher));
    app.listen(process.env.PORT || 4000);
}
