import zlib from "zlib";
import crypto from "crypto";
import dgram, { Socket } from "dgram";
import EventEmitter from "events";
import os from "os";
import { LEVEL, LogArgs, Serve } from "./interfaces";
import Helper from "./helper";

type Config = {
  servers: Serve[];
  hostname?: string;
  facility?: string;
  deflate?: "optimal" | "always" | "never";
  bufferSize?: number;
  ignoreErrors?: boolean;
};

class Graylog extends EventEmitter {
  private static instance: Graylog;

  public servers!: Serve[];
  public hostname!: string;
  public facility!: string;
  public deflate!: string;
  public client: Socket | null;
  public bufferSize!: number;

  private unsentMessages: number;
  private unsentChunks: number;
  private callCount: number;
  private isDestroyed: boolean;
  private _onClose: boolean;
  public ignoreErrors: boolean;

  private helper = new Helper();
  private constructor() {
    super();
    this.client = null;

    this.unsentMessages = 0;
    this.unsentChunks = 0;
    this.callCount = 0;

    this.isDestroyed = false;
    this._onClose = false;
    this.ignoreErrors = false;
  }

  public setConfig({
    servers,
    hostname = os.hostname(),
    facility = "Node.js",
    deflate = "optimal",
    bufferSize = 1400,
    ignoreErrors = false,
  }: Config): Graylog {
    if (servers.some(s => s.host.split('.').length !== 4 || s.host.includes(' ')))
      throw new Error('Server field is wrong')
    this.servers = servers;
    this.hostname = hostname;
    this.facility = facility;
    this.deflate = deflate;
    this.bufferSize = bufferSize;
    this.ignoreErrors = ignoreErrors;
    return Graylog.getInstance();
  }

  public static getInstance(): Graylog {
    if (!Graylog.instance) Graylog.instance = new Graylog();
    return Graylog.instance;
  }

  public getServer() {
    return this.servers[this.callCount++ % this.servers.length];
  }
  public getClient() {
    if (!this.client && !this.isDestroyed) {
      this.client = dgram.createSocket("udp4");
      this.client.on("error", (err) => this.emit("error", err));
    }
    return this.client;
  }
  private destroy() {
    if (this.client) {
      this.close();
      this.client.removeAllListeners();
      this.client = null;
      this._onClose = false;
      this.isDestroyed = true;
    }
  }
  private send(chunk: Buffer, server: Serve, cb?: Function) {
    const client = this.getClient();
    if (!client) {
      const error = new Error("Socket was already destroyed");
      if (cb) return cb;
      return;
    }
    this.unsentChunks += 1;
    client.send(chunk, 0, chunk.length, server.port, server.host, (err) => {
      this.unsentChunks -= 1;
      if (err) {
        this.emit("error", err);
        if (cb) cb(err);
      }
      if (this.unsentChunks === 0 && this.unsentMessages === 0 && this._onClose)
        this.onClose();
    });
  }

  private onClose(cb: Function | null = null) {
    this.destroy();
    if (cb) cb();
  }
  private _log({
    level,
    short_message,
    full_message,
    additionalFields,
    timestamp = new Date(),
  }: LogArgs) {
    this.unsentMessages += 1;

    const message: Record<string, any> = {
      host: this.hostname,
      facility: this.facility,
    };
    const { payload } = this.helper.prepareMessagePayload(
      {
        level,
        short_message,
        timestamp,
        additionalFields,
        full_message,
      },
      message
    );

    const sendPayload = (err: any, buffer: Buffer) => {
      if (err) {
        this.unsentMessages -= 1;
        return this.emitError(err);
      }

      // If it all fits, just send it
      if (buffer.length <= this.bufferSize) {
        this.unsentMessages -= 1;
        return this.send(buffer, this.getServer());
      }

      // It didn't fit, so prepare for a chunked stream
      const bufferSize = this.bufferSize;
      const dataSize = bufferSize - 12; // the data part of the buffer is the buffer size - header size
      const chunkCount = Math.ceil(buffer.length / dataSize);
      if (chunkCount > 128) {
        this.unsentMessages -= 1;
        return this.emitError(
          "Cannot log messages bigger than " + dataSize * 128 + " bytes"
        );
      }
      // Generate a random id in buffer format
      crypto.randomBytes(8, (err, id) => {
        if (err) {
          this.unsentMessages -= 1;
          return this.emitError(err);
        }

        // To be tested: what's faster, sending as we go or prebuffering?
        const server = this.getServer();
        const chunk = Buffer.alloc(bufferSize);
        let chunkSequenceNumber = 0;

        // Prepare the header

        // Set up magic number (bytes 0 and 1)
        chunk[0] = 30;
        chunk[1] = 15;

        // Set the total number of chunks (byte 11)
        chunk[11] = chunkCount;

        // Set message id (bytes 2-9)
        id.copy(chunk, 2, 0, 8);

        const send = (err: any = null) => {
          if (err || chunkSequenceNumber >= chunkCount) {
            // We have reached the end, or had an error (which will already have been emitted)
            this.unsentMessages -= 1;
            return;
          }

          // Set chunk sequence number (byte 10)
          chunk[10] = chunkSequenceNumber;

          // Copy data from full buffer into the chunk
          const start = chunkSequenceNumber * dataSize;
          const stop = Math.min(
            (chunkSequenceNumber + 1) * dataSize,
            buffer.length
          );

          buffer.copy(chunk, 12, start, stop);

          chunkSequenceNumber++;

          // Send the chunk
          this.send(chunk.slice(0, stop - start + 12), server, send);
        };

        send();
      });
    };
    if (
      this.deflate === "never" ||
      (this.deflate === "optimal" && payload.length <= this.bufferSize)
    ) {
      sendPayload(null, payload);
    } else {
      zlib.deflate(payload, sendPayload);
    }
  }

  public close = (cb?: Function) => {
    if (this._onClose || this.isDestroyed)
      return process.nextTick(() => {
        const error = new Error("Close was already called once");
        if (cb) return cb(error);
        this.emit("error", error);
      });
    this._onClose = true;
    if (this.unsentChunks === 0 && this.unsentMessages === 0) {
      process.nextTick(this.onClose.bind(this));
    }
  };
  public emitError(err: Error | string): void {
    this.emit("error", err);

    if (this.unsentChunks === 0 && this.unsentMessages === 0 && this._onClose) {
      this.onClose();
    }
  }

  public info(
    short_message: any,
    full_message?: any,
    additionalFields?: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.INFO,
    });
  }
  public debug(
    short_message: any,
    full_message: any,
    additionalFields: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.DEBUG,
    });
  }
  public log(
    short_message: any,
    full_message?: any,
    additionalFields?: any,
    timestamp?: Date
  ) {
    return this.info(short_message, full_message, additionalFields, timestamp);
  }

  public notice(
    short_message: any,
    full_message: any,
    additionalFields: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.NOTICE,
    });
  }

  public warning(
    short_message: any,
    full_message?: any,
    additionalFields?: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.WARNING,
    });
  }

  public error(
    short_message: any,
    full_message?: any,
    additionalFields?: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.ERROR,
    });
  }

  public critical(
    short_message: any,
    full_message: any,
    additionalFields: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.CRIT,
    });
  }

  public emergency(
    short_message: any,
    full_message?: any,
    additionalFields?: any,
    timestamp?: Date
  ) {
    return this._log({
      short_message,
      full_message,
      additionalFields,
      timestamp,
      level: LEVEL.EMERG,
    });
  }
}

export const graylog = Graylog.getInstance();
