import { EventEmitter } from "events";
import ms = require("ms");
import * as pg from "pg";
import { instance as db } from "../db";
import { Database } from "../db/Database";
import { Transaction } from "../db/Transaction";
import createLogger from "../logger";
import Job from "../models/Job";

const logger = createLogger("queue");
export type JobHandler = (metadata: any) => Promise<boolean>;

export class Queue {
    private jobMap = new Map<string, JobHandler>();
    private current = 0;
    public constructor(
        public readonly maxConcurrency: number = 5,
        public readonly timeout: number = 120 //Timeout for jobs in seconds
    ) {
        this.handleNotification = this.handleNotification.bind(this);
        // Ugly hack is needed as upstream type do not support notification
        // event type
        db.listener.on("notification" as any, this.handleNotification as any);
    }

    public async publish(
        type: string,
        metadata: any,
        tOrDb: Transaction | Database = db
    ) {
        return Job.create(type, metadata, tOrDb);
    }

    public job(type: string, handler: JobHandler) {
        if (this.jobMap.has(type)) {
            throw new Error("You can only assign one listener per job");
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
    private async loop(type: string) {
        if (this.current >= this.maxConcurrency) {
            return;
        }

        this.current++;

        while (true) {
            const handler = this.jobMap.get(type);
            // We have stopped listening
            if (!handler) {
                break;
            }

            const transaction = await db.transaction();

            try {
                const job = await Job.getByType(type, transaction);

                if (!job) {
                    break;
                }

                if(job.startedAt) {
                    if(Date.now() - job.startedAt.getTime() > this.timeout*1000){
                        job.status = "failed";
                        //TODO clean up workers and things
                    }
                }
                
                if(job.status != "failed") {
                    try {
                        const completed = await handler(job.metadata);
                        job.status = completed ? "completed" : "failed";
                    } catch (e) {
                        if (job.retriesRemaining > 0) {
                            job.status = "waiting";
                            job.retriesRemaining--;
                            // Exponential back-off
                            job.runAfter = new Date(
                                job.runAfter.getTime() + ms("10m")
                            );
                        } else {
                            job.status = "failed";
                        }
                    }
                }

                await job.update(transaction);
                await transaction.commit();
            } catch (e) {
                await transaction.rollback();
                logger.error("Failed to finish job", e);
            } finally {
                await transaction.release();
            }
        }

        this.current--;
    }

    // Listen for notification
    private async subscribe(channel: string) {
        await db.listener.query(`LISTEN ${channel}`);
    }

    private async unsubscribe(channel: string) {
        await db.listener.query(`UNLISTEN ${channel}`);
    }

    private handleNotification(msg: pg.Notification) {
        const { channel, payload } = msg;
        const jobName = channel.replace("pg_queue_simple_trigger_created_", "");
        this.loop(jobName);
    }
}
