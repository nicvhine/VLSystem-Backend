// Authorize requests ensuring user role is in allowed roles
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
      const userRole = req.user?.role;
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: "Access denied: Unauthorized role" });
      }
      next();
    };
  }
  
  module.exports = authorizeRole;
  