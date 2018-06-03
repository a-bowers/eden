import queue from "../Queue";
import { dbToProp } from "../utils/db";
import { TransOrDB } from "./helpers";
import Job from "./Job";

export class Module {
    public static readonly tableName = "modules";
    public static readonly jobModuleMapName = "modules_jobs";

    public static readonly queries = {
        associateJob: `INSERT into ${Module.jobModuleMapName} (
            module_id, job_id
        ) VALUES ($1, $2) returning *`,
        createModule: `INSERT into ${Module.tableName}(
            wt_name, client_id
        ) VALUES($1, $2) returning *`,
        getByClientAndName: `SELECT * FROM ${
            Module.tableName
        } WHERE client_id=$1 AND wt_name=$2`,
        getById: `SELECT * from ${Module.tableName} WHERE id=$1`,
        queryJobs: `SELECT * from ${Module.jobModuleMapName} WHERE id=$1`,
        updateHash: `UPDATE ${
            Module.tableName
        } SET dependency_file_hash=$2, modules_status='provisioning' WHERE id=$1`,
        updateStatus: `UPDATE ${Module.tableName} SET modules_status=$3 WHERE 
            id = (
                SELECT module_id from ${Module.jobModuleMapName} 
                WHERE job_id=$1
            )
        AND dependency_file_hash=$2`,
    };

    public static readonly overrideMap = Object.freeze({
        client_id: "clientId",
        dependency_file_hash: "dependencyFileHash",
        modules_status: "status",
        wt_name: "wtName"
    });

    public static async getById(id: string, instance: TransOrDB) {
        const result = await instance.query(Module.queries.getById, [id]);
        if (!result.rowCount) {
            return null;
        }
        return new Module(result.rows[0]);
    }

    public static async getByClientAndName(
        clientId: string,
        wtName: string,
        instance: TransOrDB
    ) {
        const result = await instance.query(Module.queries.getByClientAndName, [
            clientId,
            wtName
        ]);
        if (!result.rowCount) {
            return null;
        }
        return new Module(result.rows[0]);
    }

    public static async create(
        clientId: string,
        wtName: string,
        instance: TransOrDB
    ) {
        const result = await instance.query(Module.queries.createModule, [
            wtName,
            clientId
        ]);
        if (!result.rowCount) {
            throw new Error('Failed to create a module.');
        }
        return new Module(result.rows[0]);
    }

    public static async updateStatus(
        jobId: number,
        hash: string,
        didItComplete: boolean,
        instance: TransOrDB
    ) {
        const result = await instance.query(Module.queries.updateStatus, [
            jobId,
            hash,
            (didItComplete ? 'provisioned' : 'provisioning_failed')
        ]);
    }

    public readonly id!: number;

    public readonly wtName!: string;
    public readonly clientId!: string;

    public status!: string;
    public dependencyFile!: string;
    public dependencyFileHash!: string;

    constructor(row: any) {
        Object.assign(this, dbToProp(row, Module.overrideMap));
    }

    public async addDeploymentJob(job: Job, instance: TransOrDB) {
        const result = await instance.query(Module.queries.associateJob, [
            this.id,
            job.id
        ]);
        if (result.rowCount === 0) {
            throw new Error("Unable to insert into table");
        }
        return result.rows[0];
    }

    public async listDeploymentJobs(instance: TransOrDB) {
        const result = await instance.query(Module.queries.queryJobs, [
            this.id
        ]);
        return result.rows.map(jobData => new Job(jobData));
    }

    public async updateDeploymentHash(hash: string, instance: TransOrDB) {
        const result = await instance.query(Module.queries.updateHash, [
            this.id, 
            hash
        ]);
        if (result.rowCount === 0){
            throw new Error('Unable to update hash');
        }
        if (result.rowCount > 1) {
            throw new Error('Hey you, release!! (You just nuked the database))');
        }
        this.dependencyFileHash = hash;
    }
}
