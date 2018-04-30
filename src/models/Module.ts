import queue from '../Queue';
import { dbToProp } from '../utils/db';
import { TransOrDB } from './helpers';

export class Module {
    public static readonly tableName = 'modules';

    public static readonly queries = {
        createModule: `INSERT into ${Module.tableName}(
            wt_name, client_id
        ) VALUES($1, $2) returning *`,
        getByClientAndName: `SELECT * ${Module.tableName} WHERE client_id=$1 AND wt_name=$2`,
        getById: `SELECT * frome ${Module.tableName} WHERE id=$1`,
        updateHash: `UPDATE ${Module.tableName} SET dependency_file_hash=$2 WHERE id=$1`,
    };

    public static readonly overrideMap = Object.freeze({
        'client_id': 'clientId',
        'dependency_file_hash': 'dependencyFileHash',
        'modules_status': 'status',
        'wt_name': 'wtName',
    });

    public static async getById(id: string, instance: TransOrDB) {
        const result = await instance.query(Module.queries.getById, [id]);
        if (!result.rowCount) {
            return null;
        }
        return new Module(result.rows[0]);
    }

    public static async getByClientAndName(clientId: string, wtName: string, instance: TransOrDB) {
        const result = await instance.query(Module.queries.getByClientAndName, [clientId, wtName]);
        if (!result.rowCount) {
            return null;
        }
        return new Module(result.rows[0]);
    }

    public static async create(clientId: string, wtName: string, instance: TransOrDB) {
        const result = await instance.query(Module.queries.createModule, [
            wtName, clientId
        ]);
        if (!result.rowCount) {
            return null;
        }
        return new Module(result.rows[0]);
    }

    public readonly wtName!: string;
    public readonly clientId!: string;

    public status!: string;
    public dependencyFile!: string;
    public dependencyFileHash!: string;

    private constructor(row: any) {
        Object.assign(this, dbToProp(row, Module.overrideMap));
    }
}
