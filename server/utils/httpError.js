// Creates an error that carries an HTTP status code
const httpError = (status, message) => {
  const err = new Error(message);
  err.statusCode = status;
  return err;
};

module.exports = httpError;