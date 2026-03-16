const { AppError } = require('./errorHandler');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) {
      const messages = error.details.map((d) => d.message).join('; ');
      return next(new AppError(400, messages));
    }
    req[source] = value;
    next();
  };
}

module.exports = validate;
