const { supabase } = require("../config/supabase");
const { HttpError, unwrap } = require("../middleware/errorHandler");
const { parseDate, rentalDays, rangesOverlap, rentalCost } = require("./dates");

const MAX_RENTAL_DAYS = 60;

const readId = (value, label = "Vehicle") => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, `${label} not found!`);
  return id;
};

const readDates = (startDate, endDate) => {
  if (!startDate || !endDate) {
    throw new HttpError(400, "start_date and end_date are required (YYYY-MM-DD)!");
  }
  if (parseDate(startDate) === null || parseDate(endDate) === null) {
    throw new HttpError(400, "Dates must be real dates in YYYY-MM-DD format!");
  }
  if (endDate < startDate) {
    throw new HttpError(400, "end_date cannot be before start_date!");
  }
  const days = rentalDays(startDate, endDate);
  if (days > MAX_RENTAL_DAYS) {
    throw new HttpError(400, `A rental can be at most ${MAX_RENTAL_DAYS} days!`);
  }
  return days;
};

const findVehicle = async (id) => {
  const vehicle = unwrap(await supabase.from("vehicles").select("*").eq("id", id).maybeSingle());
  if (!vehicle) throw new HttpError(404, "Vehicle not found!");
  return vehicle;
};

const getSchedule = async (vehicleId) =>
  unwrap(await supabase.rpc("vehicle_schedule", { p_vehicle_id: vehicleId }));

const findConflicts = (schedule, startDate, endDate) =>
  schedule.filter(
    (rental) =>
      (rental.status === "booked" || rental.status === "active") &&
      rangesOverlap(startDate, endDate, rental.start_date, rental.end_date),
  );

const quoteFor = async (vehicle, startDate, endDate) => {
  const days = readDates(startDate, endDate);
  const conflicts = findConflicts(await getSchedule(vehicle.id), startDate, endDate);
  return {
    days,
    daily_rate: Number(vehicle.daily_rate),
    total_cost: rentalCost(vehicle.daily_rate, days),
    available: vehicle.status !== "maintenance" && conflicts.length === 0,
    conflicts: conflicts.map(({ start_date, end_date }) => ({ start_date, end_date })),
  };
};

module.exports = { readId, readDates, findVehicle, getSchedule, findConflicts, quoteFor };
