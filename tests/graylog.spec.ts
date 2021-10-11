import { graylog, redifineConsole } from "../src/index";

describe("Graylog", () => {
  const config = {
    servers: [{ host: "12.34.56.78", port: 12 },{ host: "12.34.56.71", port: 12 },],
  };
  const bad_config = {
    servers: [{ host: "12.34,56.78", port: 12 }],
  };

  it("Config", () => {
    expect(() => {
      graylog.setConfig(bad_config);
    }).toThrow("Server field is wrong");
    expect(graylog.setConfig(config)).toBe(graylog);
  });
  it("Servers", () => {
      graylog.setConfig(config);
    expect(graylog.getServer()).toBe(config.servers[0]);
    expect(graylog.getServer()).toBe(config.servers[1]);
    expect(graylog.getServer()).toBe(config.servers[0]);
  });
});
