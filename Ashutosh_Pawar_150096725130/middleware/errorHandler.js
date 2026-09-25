class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const DB_ERRORS = {
  "23P01": [400, "Vehicle already reserved during this timeframe"],
  "23001": [400, "This record is still linked to other records"],
  "23503": [400, "This record is still linked to other records"],
  "23505": [409, "This record already exists"],
  "23514": [400, null],
  "22P02": [400, "Invalid value in request"],
  "22007": [400, "Invalid date"],
  "22008": [400, "Invalid date"],
  "42501": [403, null],
  "P0001": [400, null],
};

const unwrap = ({ data, error }) => {
  if (!error) return data;
  const known = DB_ERRORS[error.code];
  if (known) throw new HttpError(known[0], known[1] || error.message);
  throw new Error(error.message);
};

const notFound = (request, response) => {
  response.status(404).json({ message: "Route not found" });
};

const errorHandler = (err, request, response, next) => {
  if (err.type === "entity.parse.failed") {
    return response.status(400).json({ message: "Invalid JSON body!" });
  }
  if (err instanceof HttpError) {
    return response
      .status(err.status)
      .json(err.details ? { message: err.message, ...err.details } : { message: err.message });
  }
  console.error(err);
  return response.status(500).json({ message: "Something went wrong" });
};

module.exports = { HttpError, unwrap, notFound, errorHandler };
