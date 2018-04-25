import {EventEmitter} from 'events';
import * as pg from 'pg';
import { Job } from './Job';

const DB_NAME = 'pg_queue_simple_jobs';

async function getUnclaimedJob(client: pg.PoolClient, type: string) {
    const result = await client.query(`UPDATE ${DB_NAME} SET status='busy'
        WHERE jobid = (
            SELECT jobid FROM ${DB_NAME}
            WHERE status = 'waiting' AND type = $1
            ORDER BY jobid
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        ) RETURNING jobid, metadata
    `, [type]);

    if (!result.rowCount) {
        return null;
    }

    const {jobid, metadata} = result.rows[0];

    return new Job(jobid, type, metadata);
}

async function updateJobStatus(client: pg.PoolClient, job: Job) {
    const result = await client.query(
        `UPDATE ${DB_NAME} SET status=$1
            WHERE jobid = $2
        `, [job.result, job.id]);
    return (result.rowCount > 0);
}

async function createJob(client: pg.PoolClient, type: string, metadata: any) {
    const result = await client.query(
        `INSERT into ${DB_NAME}(type, metadata) VALUES($1, $2) RETURNING jobid`,
        [type, metadata]
    );
    return result.rowCount > 0 ? result.rows[0].jobid : null;
}

export type JobHandler = (job: Job) => Promise<void>;

export class Queue {
    public static async create(dbUrl = process.env.DATABASE_URL) {
        if (!dbUrl) {
            throw new Error("Error Initializing Queue: You must either set environment variable DATABASE_URL or pass dbUrl explicitly")
        }

        const client = new pg.Client(dbUrl);
        const pool = new pg.Pool({
            connectionString: dbUrl
        });
        return new Queue(client, pool);
    }

    private jobMap = new Map<string, JobHandler>();

    private constructor(
        private readonly client: pg.Client,
        private readonly pool: pg.Pool,
    ) {
        this.handleNotification = this.handleNotification.bind(this);
        // Ugly hack is needed as upstream type do not support notification
        // event type
        this.client.on(
            'notification' as any,
            this.handleNotification as any
        );
    }

    public async publish(type: string, metadata: any) {
        return this.transaction(async (client) => {
            await createJob(client, type, metadata);
        });
    }

    public job(type: string, handler: (job: Job) => Promise<void>) {
        if (this.jobMap.has(type)) {
            throw new Error('You can one job Can listen at a time');
        }
        this.jobMap.set(type, handler);
        this.subscribe(`pg_queue_simple_trigger_created_${type}`);
        this.loop(type);
    }

    public optOut(type: string) {
        this.unsubscribe(`pg_queue_simple_trigger_created_${type}`);
        this.jobMap.delete(type);
    }

    // Simple logic to run handlers
    private loop(type: string) {
        this.transaction(async (client) => {
            const job = await getUnclaimedJob(client, type);

            const handler = this.jobMap.get(type);
            if (!job) {
                return;
            }

            if (!handler) {
                return;
            }

            await handler(job);
            await updateJobStatus(client, job);

            // If we succesfully completed the last one
            // optimistically check for next
            this.loop(type);
        });
    }

    // Listen for notification
    private async subscribe(channel: string) {
        await this.client.connect();
        await this.client.query(`LISTEN ${channel}`);
    }

    private async unsubscribe(channel: string) {
        await this.client.query(`UNLISTEN ${channel}`);
    }

    private handleNotification(msg: pg.Notification) {
        const {channel, payload}= msg;
        const jobName = channel.replace('pg_queue_simple_trigger_created_', '');
        this.loop(jobName);
    }

    // Gets first job from the table
    private async transaction(fn: (client: pg.PoolClient) => Promise<any>) {
        const client = await this.pool.connect();

        if (!client) {
            throw new Error('Failed to accquire client');
        }

        try {
            await client.query("BEGIN");
            await fn(client);
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
        } finally {
            await client.release();
        }
    }
}
