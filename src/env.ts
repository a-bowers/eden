import * as dotenv from 'dotenv';
dotenv.load();

export default function env(param: string): string {
    if (!process.env[param]) {
        throw new Error(`Invalid Environment Variable: ${param}`);
    }
    return process.env[param]!;
}
