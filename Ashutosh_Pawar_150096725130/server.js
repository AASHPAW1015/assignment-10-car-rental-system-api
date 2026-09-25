require("dotenv").config({ quiet: true });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/authRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const rentalRoutes = require("./routes/rentalRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api", (request, response) => {
  response.status(200).json({ message: "connected" });
});

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/rentals", rentalRoutes);
app.use(express.static(path.join(__dirname, "public")));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}!!`);
});
