import {
  AppError as ServerAppError,
  NotFoundError as ServerNotFoundError,
  UnauthorizedError as ServerUnauthorizedError,
  ValidationError as ServerValidationError,
} from "@entitlement-os/shared/errors";

export const AppError = ServerAppError;
export const NotFoundError = ServerNotFoundError;
export const UnauthorizedError = ServerUnauthorizedError;
export const ValidationError = ServerValidationError;
