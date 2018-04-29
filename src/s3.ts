import {S3} from 'aws-sdk';
import env from './env';

export default new S3({
    accessKeyId: env('AWS_ACCESS_KEY_ID'),
    region: env('AWS_REGION'),
    secretAccessKey: env('AWS_ACCESS_KEY')
});
