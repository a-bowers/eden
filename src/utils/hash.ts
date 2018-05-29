import { createHash } from "crypto";

const ALGORITHM = "md5";

export function hashJson(data: any) {
    return hash(JSON.stringify(data));
}

export function hash(data: Buffer | string) {
    return createHash(ALGORITHM)
        .update(data)
        .digest("hex");
}
