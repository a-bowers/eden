#!/usr/bin/env npx ts-node
import * as dotenv from 'dotenv';
import * as yargs from 'yargs';
import {Queue} from '../src/queue/Queue';

dotenv.load()

yargs
    .command('publish', 'publishes a job on job queue', (builder) => {
        return builder.option('t', {
            alias: 'type',
            desc: 'The type of job to publish'
        }).option('d', {
            alias: 'data',
            desc: 'JSON data to publish'
        })
    }, (arg) => publish(arg))
    .command('subscribe', 'listens for a job on the job queue', (builder) => {
        return builder.option('t', {
            alias: 'type',
            desc: 'The type of job to listen to'
        })
        .option('e', {
            alias: 'exec',
            desc: 'The command to execute with the job'
        })
        .demandOption(['t', 'e'])
    }, (arg) => subscribe(arg))
    .help()
    .demandCommand(1)
    .parse();


async function publish(arg: yargs.Arguments) {
    const {t, d = '{}'} = arg;
    const queue = await Queue.create();
    await queue.publish(t, d);
    process.exit(0);
}

async function subscribe(arg: yargs.Arguments) {
    const {t, e} = arg;
    const queue = await Queue.create();
    await queue.job('kappa', async (job) => {
        console.log("Ayyyyy kappa kappa", e);
        job.success();
    });
}
