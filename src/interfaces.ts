export type Serve = { host: string; port: number };
export enum LEVEL {
  EMERG = 0, // system is unusable
  ALERT = 1, // action must be taken immediately
  CRIT = 2, // critical conditions
  ERR = 3, // error conditions
  ERROR = 3, // because people WILL typo
  WARNING = 4, // warning conditions
  NOTICE = 5, // normal, but significant, condition
  INFO = 6, // informational message
  DEBUG = 7, // debug level message
}

export type LogArgs = {
  level: LEVEL;
  short_message: string | Record<string, any> | Error;
  full_message?: string | Record<string, any> | Error | object;
  additionalFields?: Record<string, any>;
  timestamp?: Date;
};
