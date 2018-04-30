import * as pg from 'pg';

export class Transaction {

    constructor(
        private readonly client: pg.PoolClient
    ) {
    }

    public async begin() {
        await this.client.query("BEGIN");
    }

    public async commit() {
        await this.client.query("COMMIT");

    }

    public async rollback() {
        await this.client.query("ROLLBACK");
    }

    public async release() {
        await this.client.release();
    }

    public async query(statement: string, params: any []) {
        return this.client.query(statement, params);
    }
}
