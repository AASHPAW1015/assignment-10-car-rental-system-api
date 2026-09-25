const { HttpError, unwrap } = require("../middleware/errorHandler");
const { readId, findVehicle, quoteFor } = require("../utils/booking");
const { today } = require("../utils/dates");

const STATUSES = ["booked", "active", "completed", "cancelled"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WITH_VEHICLE = "*, vehicle:vehicles(id, brand, model, category, daily_rate, status)";

const findRental = async (db, id) => {
  const rental = unwrap(await db.from("rentals").select(WITH_VEHICLE).eq("id", id).maybeSingle());
  if (!rental) throw new HttpError(404, "Rental not found!");
  return rental;
};

const moveRental = async (db, id, from, to) => {
  const rental = unwrap(
    await db.from("rentals").update({ status: to }).eq("id", id).eq("status", from).select().maybeSingle(),
  );
  if (!rental) throw new HttpError(409, "This rental was changed by someone else, please reload!");
  return rental;
};

const setVehicleStatus = async (db, vehicleId, from, to) =>
  unwrap(
    await db.from("vehicles").update({ status: to }).eq("id", vehicleId).eq("status", from).select().maybeSingle(),
  );

const createRental = async (request, response) => {
  const { start_date, end_date } = request.body;
  const vehicleId = readId(request.body.vehicle_id);
  const customerName = String(request.body.customer_name || request.user.name).trim();
  const customerEmail = String(request.body.customer_email || request.user.email).toLowerCase().trim();

  if (!customerName) throw new HttpError(400, "customer_name cannot be empty!");
  if (!EMAIL_PATTERN.test(customerEmail)) throw new HttpError(400, "customer_email is not a valid email!");

  const vehicle = await findVehicle(vehicleId);
  const quote = await quoteFor(vehicle, start_date, end_date);

  if (start_date < today()) {
    throw new HttpError(400, "start_date cannot be in the past!");
  }
  if (vehicle.status === "maintenance") {
    throw new HttpError(400, "This vehicle is under maintenance and cannot be booked!");
  }
  if (quote.conflicts.length > 0) {
    throw new HttpError(400, "Vehicle already reserved during this timeframe", { conflicts: quote.conflicts });
  }

  const rental = unwrap(
    await request.db
      .from("rentals")
      .insert({
        user_id: request.user.id,
        vehicle_id: vehicle.id,
        customer_name: customerName,
        customer_email: customerEmail,
        start_date,
        end_date,
        total_cost: quote.total_cost,
      })
      .select(WITH_VEHICLE)
      .single(),
  );

  return response.status(201).json({
    message: "Vehicle booked!",
    billing: { days: quote.days, daily_rate: quote.daily_rate, total_cost: quote.total_cost },
    rental,
  });
};

const listRentals = async (request, response, onlyMine) => {
  let query = request.db.from("rentals").select(WITH_VEHICLE).order("start_date", { ascending: false });

  if (onlyMine) query = query.eq("user_id", request.user.id);
  if (request.query.status) {
    if (!STATUSES.includes(request.query.status)) {
      throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);
    }
    query = query.eq("status", request.query.status);
  }
  if (request.query.vehicle_id) {
    query = query.eq("vehicle_id", readId(request.query.vehicle_id));
  }

  const rentals = unwrap(await query);
  const total_spent = rentals
    .filter((rental) => rental.status !== "cancelled")
    .reduce((sum, rental) => sum + Number(rental.total_cost), 0);

  return response.status(200).json({ count: rentals.length, total_spent, rentals });
};

const getMyBookings = (request, response) => listRentals(request, response, true);

const getAllRentals = (request, response) => listRentals(request, response, false);

const getRentalById = async (request, response) => {
  const rental = await findRental(request.db, readId(request.params.id, "Rental"));
  return response.status(200).json({ rental });
};

const cancelRental = async (request, response) => {
  const rental = await findRental(request.db, readId(request.params.id, "Rental"));

  if (rental.status !== "booked") {
    throw new HttpError(400, `Cannot cancel a rental that is ${rental.status}!`);
  }
  if (request.user.role !== "admin" && rental.start_date < today()) {
    throw new HttpError(400, "Cannot cancel a rental whose start date has passed!");
  }

  const cancelled = await moveRental(request.db, rental.id, "booked", "cancelled");
  return response.status(200).json({ message: "Rental cancelled!", rental: cancelled });
};

const startRental = async (request, response) => {
  const rental = await findRental(request.db, readId(request.params.id, "Rental"));
  const now = today();

  if (rental.status !== "booked") {
    throw new HttpError(400, `Only booked rentals can be started, this one is ${rental.status}!`);
  }
  if (rental.start_date > now || rental.end_date < now) {
    throw new HttpError(400, `This rental can only be picked up between ${rental.start_date} and ${rental.end_date}!`);
  }
  if (rental.vehicle.status !== "available") {
    throw new HttpError(400, `Vehicle is ${rental.vehicle.status}, it cannot be handed over now!`);
  }

  const vehicle = await setVehicleStatus(request.db, rental.vehicle_id, "available", "rented");
  if (!vehicle) throw new HttpError(409, "Vehicle status changed, please reload!");

  try {
    const started = await moveRental(request.db, rental.id, "booked", "active");
    return response.status(200).json({ message: "Rental started, vehicle is now rented!", rental: started, vehicle });
  } catch (error) {
    await setVehicleStatus(request.db, rental.vehicle_id, "rented", "available");
    throw error;
  }
};

const completeRental = async (request, response) => {
  const rental = await findRental(request.db, readId(request.params.id, "Rental"));

  if (rental.status !== "active") {
    throw new HttpError(
      400,
      rental.status === "booked"
        ? "This rental has not started yet, use PATCH /api/rentals/:id/start first!"
        : `Cannot complete a rental that is ${rental.status}!`,
    );
  }

  const completed = await moveRental(request.db, rental.id, "active", "completed");
  const vehicle = await setVehicleStatus(request.db, rental.vehicle_id, "rented", "available");

  return response.status(200).json({
    message: "Vehicle returned, rental completed!",
    rental: completed,
    vehicle: vehicle || rental.vehicle,
  });
};

module.exports = {
  createRental,
  getMyBookings,
  getAllRentals,
  getRentalById,
  cancelRental,
  startRental,
  completeRental,
};
