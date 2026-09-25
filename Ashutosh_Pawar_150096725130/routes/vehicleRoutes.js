const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/auth");
const {
  getVehicles,
  getVehicleById,
  getQuote,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} = require("../controllers/vehicleController");

router.get("/", getVehicles);
router.get("/:id", getVehicleById);
router.get("/:id/quote", getQuote);
router.post("/", verifyToken, requireAdmin, createVehicle);
router.put("/:id", verifyToken, requireAdmin, updateVehicle);
router.delete("/:id", verifyToken, requireAdmin, deleteVehicle);

module.exports = router;
