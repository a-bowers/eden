import * as Boss from 'pg-boss';
import * as R from 'routing-controllers';

@R.JsonController()
export class API {

    constructor(
        private readonly jobs: Boss
    ) {}

    @R.Post('/provision')
    public async requestProvisioning(@R.Body() provisioningRequest: any) {
        this.jobs.publish(provisioningRequest);
    }
}
