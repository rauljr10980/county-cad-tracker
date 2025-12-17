// Entry point for Cloud Functions Gen 1
const app = require('./index');

exports.api = (req, res) => {
  app(req, res);
};

