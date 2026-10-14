const { TestEnvironment } = require('jest-environment-jsdom');

/** jsdom without Node's web globals that react-router and api() rely on. */
class Environment extends TestEnvironment {
  constructor(...args) {
    super(...args);
    Object.assign(this.global, { Headers, Request, Response, TextEncoder, TextDecoder });
  }
}

module.exports = Environment;
