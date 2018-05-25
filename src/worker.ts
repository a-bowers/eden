import createLogger from './logger';
import jobs from './queue';
import {provision} from './scripts/provision';

const logger = createLogger('worker');

export default async function createWorker() {
    logger.info(`Creating a worker`);

    jobs.job('provision', provision as any);

    logger.info(`Worker created and listening`);
}
