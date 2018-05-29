export interface IParam {
    [key: string]: any;
}

export interface IMap {
    [key: string]: string;
}

export function dbToProp(params: IParam, map: IMap) {
    const result: IParam = {};
    for (const key of Object.keys(params)) {
        if (params[key]) {
            result[map[key] || key] = params[key];
        }
    }
    return result;
}

export function propToDb(params: IParam, map: IMap) {
    const reflected: IParam = {};
    for (const key of Object.keys(map)) {
        reflected[map[key]] = key;
    }
    return dbToProp(params, map);
}
