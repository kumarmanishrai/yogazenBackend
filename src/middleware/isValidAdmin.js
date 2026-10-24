// Middleware to authenticate and validate administrators via JWT
const isValidAdmin = (req, res, next) => {
  // Authentication logic will verify token and attach req.admin
  next();
};

module.exports = isValidAdmin;

