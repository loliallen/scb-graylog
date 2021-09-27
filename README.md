# Graylog v1.0.0

Installation npm

```sh
npm install scb-graylog
```

### Using

TypeScript

```ts
import graylog, { appendToConsole } from "graylog";

const gr = graylog.setConfig({
  servers: [{ host: " 10.0.15.34", port: 1246 }],
  ignoreErrors: true,
});

gr.log("some data");
// or
graylog.log("some data");

//
appendToConsole();
console.log("Logg..");
```

JavaScript (NodeJS)

```js
const graylog = require("graylog");

const gr = graylog.setConfig({
  servers: [{ host: " 10.0.15.34", port: 1246 }],
  ignoreErrors: true,
});

gr.log("some data");
// or
graylog.log("some data");
```
