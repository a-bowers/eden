import createLogger from './logger';
import {Queue} from './queue/Queue';
import {provision} from './scripts/provision';

const logger = createLogger('worker');

export default async function createWorker() {
    logger.info(`Creating a worker`);

    const jobs = await Queue.create();
    jobs.job('provision', provision);

    logger.info(`Worker created and listening`);
}
