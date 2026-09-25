const { authClient, clientForToken } = require("../config/supabase");
const { HttpError, unwrap } = require("../middleware/errorHandler");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readCredentials = (body) => {
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  if (!email || !password) {
    throw new HttpError(400, "email and password are required!");
  }
  return { email, password };
};

const register = async (request, response) => {
  const { email, password } = readCredentials(request.body);
  const name = String(request.body.name || "").trim();

  if (!name) {
    throw new HttpError(400, "name is required!");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Please enter a valid email!");
  }
  if (password.length < 6) {
    throw new HttpError(400, "password must be at least 6 characters!");
  }

  const { data, error } = await authClient().auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    throw new HttpError(error.status === 429 ? 429 : 400, error.message);
  }

  return response.status(201).json({
    message: data.session
      ? "Account created!"
      : "Account created! Check your email to confirm it before logging in.",
    user: { id: data.user.id, email: data.user.email, name },
  });
};

const login = async (request, response) => {
  const { email, password } = readCredentials(request.body);

  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error) {
    const message =
      error.code === "email_not_confirmed" ? "Please confirm your email first!" : "Invalid credentials!";
    throw new HttpError(401, message);
  }

  const token = data.session.access_token;
  const profile = unwrap(
    await clientForToken(token).from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
  );

  return response.status(200).json({
    message: "Login successful",
    token,
    expires_at: data.session.expires_at,
    user: profile,
  });
};

const getProfile = (request, response) => {
  return response.status(200).json({ user: request.user });
};

module.exports = { register, login, getProfile };
