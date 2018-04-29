declare module "connect-ensure-permissions" {
    import * as Express from 'express';

    export interface IPermissionProvider {
        (req: Express.Request): string[];
    }

    export interface IPermissionCheckerOptions {
        getPermissionsFromRequest ?: IPermissionProvider
    }

    export default function createPermissionChecker(
        options?: IPermissionCheckerOptions
    ): (permission: string) => Express.Handler;
}
