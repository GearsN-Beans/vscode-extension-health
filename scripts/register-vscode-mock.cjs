'use strict';
// Redirects `require('vscode')` to the lightweight mock in out/test/vscodeMock.js so unit tests
// can run under plain Node instead of the full VS Code Extension Host.
const Module = require('module');
const path = require('path');

const mockPath = path.join(__dirname, '..', 'out', 'test', 'vscodeMock.js');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === 'vscode') {
    return mockPath;
  }
  return originalResolveFilename.call(this, request, ...rest);
};
