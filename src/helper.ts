import { LogArgs } from "./interfaces";

export default class Helper {
  public prepareMessagePayload(
    {
      level,
      short_message,
      full_message,
      additionalFields,
      timestamp = new Date(),
    }: LogArgs,
    message: Record<string, any>
  ) {
    message.version = "1.1";
    message.timestamp = timestamp.getTime() / 1000;
    message.level = level;

    let fileinfo;
    if (
      typeof short_message !== "object" &&
      typeof full_message === "object" &&
      additionalFields === undefined
    ) {
      // Only short message and additional fields are available
      message.short_message = short_message;
      message.full_message = short_message;

      additionalFields = full_message;
    } else if (typeof short_message !== "object") {
      // We normally set the data
      message.short_message = short_message;
      message.full_message = full_message || short_message;
    } else if (short_message.stack && short_message.message) {
      // Short message is an Error message, we process accordingly
      message.short_message = short_message.message;
      message.full_message = short_message.stack;

      // extract error file and line
      fileinfo = message.stack.split("\n")[0];
      fileinfo = fileinfo.substr(fileinfo.indexOf("("), fileinfo.indexOf(")"));
      fileinfo = fileinfo.split(":");

      message.file = fileinfo[0];
      message.line = fileinfo[1];

      additionalFields = (full_message as object) || additionalFields;
    } else {
      message.full_message = message.short_message =
        JSON.stringify(short_message);
    }

    for (const field in additionalFields) {
      message["_" + field] = additionalFields[field];
    }

    // https://github.com/Graylog2/graylog2-docs/wiki/GELF
    if (message._id) {
      message.__id = message._id;
      delete message._id;
    }

    // Compression
    return { payload: Buffer.from(JSON.stringify(message)) };
  }
}
