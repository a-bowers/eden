import { PoolClient } from "pg";

export class Job {
    private innerResult: 'completed' | 'failed' | 'crashed';
    constructor(
        public readonly id: number,
        public readonly type: string,
        public readonly metadata: any
    ) {
        this.innerResult = 'crashed';
    }

    public get result() {
        return this.innerResult;
    }


    public success() {
        this.innerResult = 'completed';
    }

    public failed(error: Error) {
        this.innerResult = 'failed';
    }

}
