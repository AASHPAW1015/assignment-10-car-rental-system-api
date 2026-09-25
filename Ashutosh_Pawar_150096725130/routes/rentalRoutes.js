const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/auth");
const {
  createRental,
  getMyBookings,
  getAllRentals,
  getRentalById,
  cancelRental,
  startRental,
  completeRental,
} = require("../controllers/rentalController");

router.use(verifyToken);

router.post("/", createRental);
router.get("/my-bookings", getMyBookings);
router.get("/", requireAdmin, getAllRentals);
router.get("/:id", getRentalById);
router.patch("/:id/cancel", cancelRental);
router.patch("/:id/start", requireAdmin, startRental);
router.patch("/:id/complete", requireAdmin, completeRental);

module.exports = router;
