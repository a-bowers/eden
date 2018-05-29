import { STATUS_CODES } from "http";

export class HttpError extends Error {
    public code: number;
    public message: string;

    constructor(code: number, message = STATUS_CODES[code]) {
        super(`Error(${code}): ${message}`);
        if (!STATUS_CODES[code]) {
            throw Error("Invalid Http Error");
        }
        this.code = code;
        this.message = message!;
    }

    public toJSON() {
        return {
            code: this.code,
            message: this.message
        };
    }
}
