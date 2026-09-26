// Compile Nest with decorator metadata before Vercel traces this entry point.
const { createApp } = require('../apps/api/dist/src/app.js');
let application;
module.exports = async function handler(request, response) {
  if (!application) {
    application = createApp()
      .then(async (app) => {
        await app.init();
        return app.getHttpAdapter().getInstance();
      })
      .catch((error) => {
        application = undefined;
        throw error;
      });
  }
  const server = await application;
  return server(request, response);
};
