import { readdir } from 'fs';
import { join } from 'path';
import * as pg from 'pg';
import { promisify } from 'util';
import env from '../env';
import { Transaction } from './Transaction';

const readDirAsync = promisify(readdir);

export class Database {
    public readonly models : {[key: string]: any}= {};
    public readonly listener: pg.Client;
    public readonly pool: pg.Pool;

    constructor(dbUrl: string = env('DATABASE_URL')) {
        this.listener = new pg.Client(dbUrl);
        this.pool = new pg.Pool({
            connectionString: dbUrl
        });
    }

    public async connect() {
        await this.listener.connect();
    }

    public async query(statement: string, params: any []) {
        return this.pool.query(statement, params);
    }

    // Gets a transaction
    public async transaction() {
        const client = await this.pool.connect();
        const transaction = new Transaction(client);
        return transaction;
    }
}
