const { clientForToken } = require("../config/supabase");
const { unwrap } = require("./errorHandler");

const verifyToken = async (request, response, next) => {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return response.status(401).json({ message: "No token provided!" });
  }

  const token = header.split(" ")[1];
  const db = clientForToken(token);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return response.status(401).json({ message: "Invalid or expired token, please login again!" });
  }

  const profile = unwrap(await db.from("profiles").select("*").eq("id", data.user.id).maybeSingle());
  if (!profile) {
    return response.status(401).json({ message: "Profile not found for this account!" });
  }

  request.user = profile;
  request.db = db;
  next();
};

const requireAdmin = (request, response, next) => {
  if (!request.user || request.user.role !== "admin") {
    return response.status(403).json({ message: "Admins only!" });
  }
  next();
};

module.exports = { verifyToken, requireAdmin };
