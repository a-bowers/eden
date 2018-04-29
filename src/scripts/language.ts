import { IOptions } from "glob";
import { join } from "path";

export interface ILanguageBindings {
    install: (directory: string, dependencyFile: string) => Promise<void>,
    setup?:  (directory: string, dependencyFile: string) => Promise<void>,
    getGlobParams: (directory: string, dependencyFile: string) => Promise<IOptions>,

}

export function loadLanguage(name: string): ILanguageBindings {
    return require(join(__dirname, 'lang', name)) as ILanguageBindings;
}
