#!/usr/bin/env npx ts-node
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as yargs from 'yargs';
import {Queue} from '../src/queue/Queue';
import {provision} from '../src/scripts/provision';

dotenv.load()

yargs
    .command('publish', 'publishes a job on job queue', (builder) => {
        /*return builder.option('t', {
            alias: 'type',
            desc: 'The type of job to publish'
        }).option('d', {
            alias: 'data',
            desc: 'JSON data to publish'
        })*/return builder;
    }, (arg) => publish(arg))
    .command('subscribe', 'listens for a job on the job queue', (builder) => {
        /*return builder.option('t', {
            alias: 'type',
            desc: 'The type of job to listen to'
        })
        .option('e', {
            alias: 'exec',
            desc: 'The command to execute with the job'
        })
        .demandOption(['t', 'e'])*/ return builder;
    }, (arg) => subscribe(arg))
    .help()
    .demandCommand(1)
    .parse();


async function publish(arg: yargs.Arguments) {
    const file = fs.readFileSync(path.join(__dirname, './requirements.txt'), 'ascii');
    const hash = crypto.createHash('md5').update(file).digest('hex');
    const dir = path.join(os.tmpdir(), "_" + hash);
    process.stdout.write("Writing to " + dir);
    const {t = "provision" , d = JSON.stringify({
        directory: dir,
        requirements: file
    })} = arg;
    const queue = await Queue.create();
    await queue.publish(t, d);
    process.exit(0);
}

async function subscribe(arg: yargs.Arguments) {
    const {t, e} = arg;
    const queue = await Queue.create();
    queue.job('provision', provision);
}
