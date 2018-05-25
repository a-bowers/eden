import env from './env';
import createLogger from './logger';
import createServer from './server';
import createWorker from './worker';

const logger = createLogger('main');

const runtimeTypes = {
    publisher: 'PUBLISHER',
    subscriber: 'SUBSCRIBER',
};

(async function main() {

    const APP_MODE = env('APP_MODE');
    const name = require('../package.json').name;
    logger.info(`${name} starting in ${APP_MODE}`);

    if (APP_MODE.includes(runtimeTypes.subscriber)) {
        await createWorker();
        console.log("fired up and ready to work");
    }
    if (APP_MODE.includes(runtimeTypes.publisher)) {
        await createServer();
        console.log("Fired up and ready to SERVE!");
    }

    logger.info(`${name} started successfully`);

})();
