declare module "connect-ensure-permissions" {
    import * as Express from "express";

    interface IPermissionProvider {
        (req: Express.Request): string[];
    }

    interface IPermissionCheckerOptions {
        getPermissionsFromRequest?: IPermissionProvider;
    }

    interface IScopeCheckerBuilder {
        (permission: string): Express.Handler;
    }

    interface ICreatePermissionChecker {
        (options?: IPermissionCheckerOptions): IScopeCheckerBuilder;
    }
    const k: ICreatePermissionChecker;
    export = k;
}
