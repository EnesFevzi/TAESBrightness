delete process.env.ELECTRON_RUN_AS_NODE;
const path = require("path");
const cliPath = path.join(
  path.dirname(require.resolve("electron-vite/package.json")),
  "bin",
  "electron-vite.js"
);
require(cliPath);
