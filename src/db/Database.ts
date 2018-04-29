import { readdir } from 'fs';
import { join } from 'path';
import * as pg from 'pg';
import { promisify } from 'util';
import env from '../env';

const readDirAsync = promisify(readdir);

class Database {
    public static async connect(modelsPath?: string, dbUrl: string = env('DATABASE_URL')) {
        const pool = await Database.getPool(dbUrl);
        const listener = await Database.getClient(dbUrl);
        return new Database(pool, listener, modelsPath);
    }

    private static async getPool(dbUrl: string) {
        const pool = new pg.Pool({
            connectionString: dbUrl
        });
        await pool.connect();
        return pool;
    }

    private static async getClient(dbUrl: string) {
        const client = new pg.Client(dbUrl);
        await client.connect();
        return client;
    }

    public readonly models : {[key: string]: any}= {};

    constructor(
        private readonly pool: pg.Pool,
        private readonly listener: pg.Client,
        modelsPath?: string
    ) {
        if (modelsPath) {
            this.loadModels(modelsPath);
        }
    }

    public async loadModels(dir: string) {
        const modules = await readDirAsync(dir);
        for (const moduleFileName of modules) {
            this.models[moduleFileName] = require(join(dir, moduleFileName))(this.pool);
        }
    }
}
