import * as dotenv from "dotenv";
dotenv.load();

export default function env(param: string): string {
    if (!process.env[param]) {
        throw new Error(
            `Environment Variable not configured ${param}, please check if you have it spelled correctly.`
        );
    }
    return process.env[param]!;
}
