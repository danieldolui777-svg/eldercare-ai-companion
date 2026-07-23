/**
 * DI token for the optional SMS notification provider. Kept in its own file so
 * both AlertModule (which provides it) and AlertService (which injects it) can
 * import it without a circular module reference.
 */
export const NOTIFICATION_PROVIDER = "NOTIFICATION_PROVIDER";
