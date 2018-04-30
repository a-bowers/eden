import * as pg from 'pg';
import {instance} from '../db';
import { Database } from '../db/Database';
import { Transaction } from '../db/Transaction';
import { dbToProp } from '../utils/db';

export type JOB_STATUSES = 'waiting' | 'busy' | 'failed' | 'completed';
const q = (str: string) => str.trim();
const TABLE_NAME = `pg_queue_simple_jobs`;

const CREATE_SCRIPT = q(`
    INSERT into ${TABLE_NAME}(
        type, metadata
    ) VALUES($1, $2) RETURNING id
`);

const GET_NEXT_FREE_SCRIPT = q(`
    UPDATE ${TABLE_NAME} SET status='busy', started_at= CURRENT_TIMESTAMP
        WHERE id = (
            SELECT id FROM ${TABLE_NAME}
            WHERE status = 'waiting'
            AND type = $1
            AND run_after_timestamp < CURRENT_TIMESTAMP
            ORDER BY jobid
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
    RETURNING id, metadata, status, retries_remaining, run_after
`);

const UPDATE_JOB_STATUS_SCRIPT = q(`
    UPDATE ${TABLE_NAME} SET
        status=$2,
        retries_remaining=$3,
        updated_at=to_timestamp($4),
        run_after_timestamp=$5
    WHERE id = $1
`);

const overridesMap = {
    'retries_remaining': 'retriesRemaining',
    'run_after_timestamp': 'runAfter',
    'submitted_at': 'submittedAt',
    'updated_at': 'updatedAt'
};

export default function getJobModel(db: Database | Transaction = instance) {
    return class {
        public static withTransaction(transaction: Transaction) {
            return getJobModel(transaction);
        }

        public static async getByType (type: string) {
            const result = await db.query(GET_NEXT_FREE_SCRIPT, [type]);

            if (!result.rowCount) {
                return;
            }

            return new Job(result.rows[0]);
        }

        public static async create(type: string, metadata: any) {
            const result = await db.query(
                CREATE_SCRIPT, [type, metadata]
            );
            if (!result.rowCount) {
                return null;
            }
            return new Job(result.rows[0]);
        }

        public id!: number;
        public type!: string;
        public metadata!: any;

        public status!: JOB_STATUSES;
        public retriesRemaining!: number;
        public runAfter!: Date;

        protected constructor(row: any) {
            Object.assign(this, dbToProp(row, overridesMap));
        }

        public async update() {
            const result = await db.query(UPDATE_JOB_STATUS_SCRIPT, [
                this.id,
                this.status,
                this.retriesRemaining,
                (Date.now()/1000.0),
                this.runAfter
            ]);

            if (!result.rowCount) {
                throw new Error('Unable to update');
            }
        }
    }
}
