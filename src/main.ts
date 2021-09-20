import { graylog } from "./graylog";

const defaultConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

graylog.on("error", (e) => {
  if (!graylog.ignoreErrors) defaultConsole.warn(e);
});

export const redifineConsole = () => {
  console.log = graylog.log;
  console.warn = graylog.warning;
  console.error = graylog.error;
  console.info = graylog.info;
};
export const appendToConsole = () => {
  console.log = (...data: any[]) => {
    defaultConsole.log(...data);
    graylog.log(data);
  };
  console.warn = (...data: any[]) => {
    defaultConsole.warn(...data);
    graylog.warning(data);
  };
  console.error = (...data: any[]) => {
    defaultConsole.error(...data);
    graylog.error(data);
  };
  console.info = (...data: any[]) => {
    defaultConsole.info(...data);
    graylog.info(data);
  };
};
