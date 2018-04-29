import * as pg from 'pg';
import env from '../env';

class Database {
    public async getPool(dbUrl: string = env('DATABASE_URL')) {
        const pool = new pg.Pool({
            connectionString: dbUrl
        });
        await pool.connect();
        return pool;
    }

    public async getClient(dbUrl: string = env('DATABASE_URL')) {
        const client = new pg.Client(dbUrl);
        await client.connect();
        return client;
    }
}
