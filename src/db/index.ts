import { Database } from "./Database";

export let instance = new Database();

export async function connect() {
    await instance.connect();
}
