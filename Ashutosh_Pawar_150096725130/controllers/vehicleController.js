const { supabase } = require("../config/supabase");
const { HttpError, unwrap } = require("../middleware/errorHandler");
const { readId, readDates, findVehicle, getSchedule, quoteFor } = require("../utils/booking");

const CATEGORIES = ["Sedan", "SUV", "Luxury", "Hatchback", "Electric"];
const STATUSES = ["available", "rented", "maintenance"];
const FIELDS = ["brand", "model", "year", "category", "daily_rate", "fuel_type", "seating_capacity", "status"];

const validateFields = (body, isCreate) => {
  const data = {};
  FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });

  if (isCreate) {
    const missing = FIELDS.filter(
      (field) => !["seating_capacity", "status"].includes(field) && data[field] === undefined,
    );
    if (missing.length > 0) throw new HttpError(400, `Missing fields: ${missing.join(", ")}`);
  } else if (Object.keys(data).length === 0) {
    throw new HttpError(400, `Send at least one of: ${FIELDS.join(", ")}`);
  }

  if (data.category !== undefined && !CATEGORIES.includes(data.category)) {
    throw new HttpError(400, `category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if (data.status !== undefined && !["available", "maintenance"].includes(data.status)) {
    throw new HttpError(400, "status can only be set to available or maintenance, rented is set by rentals!");
  }
  if (data.year !== undefined && (!Number.isInteger(data.year) || data.year < 1990 || data.year > 2100)) {
    throw new HttpError(400, "year must be a whole number from 1990 to 2100!");
  }
  if (data.daily_rate !== undefined && !(typeof data.daily_rate === "number" && data.daily_rate > 0)) {
    throw new HttpError(400, "daily_rate must be a number greater than 0!");
  }
  if (
    data.seating_capacity !== undefined &&
    (!Number.isInteger(data.seating_capacity) || data.seating_capacity < 1 || data.seating_capacity > 15)
  ) {
    throw new HttpError(400, "seating_capacity must be a whole number from 1 to 15!");
  }
  for (const field of ["brand", "model", "fuel_type"]) {
    if (data[field] !== undefined) {
      data[field] = String(data[field]).trim();
      if (!data[field]) throw new HttpError(400, `${field} cannot be empty!`);
    }
  }
  return data;
};

const getVehicles = async (request, response) => {
  const { category, status, start_date, end_date } = request.query;
  let query = supabase.from("vehicles").select("*").order("daily_rate", { ascending: true });

  if (category) {
    if (!CATEGORIES.includes(category)) {
      throw new HttpError(400, `category must be one of: ${CATEGORIES.join(", ")}`);
    }
    query = query.eq("category", category);
  }
  if (status) {
    if (!STATUSES.includes(status)) {
      throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);
    }
    query = query.eq("status", status);
  }
  if (start_date || end_date) {
    readDates(start_date, end_date);
    const busy = unwrap(await supabase.rpc("busy_vehicle_ids", { p_start: start_date, p_end: end_date }));
    query = query.neq("status", "maintenance");
    if (busy.length > 0) query = query.not("id", "in", `(${busy.join(",")})`);
  }

  const vehicles = unwrap(await query);
  return response.status(200).json({ count: vehicles.length, vehicles });
};

const getVehicleById = async (request, response) => {
  const vehicle = await findVehicle(readId(request.params.id));
  const rentals = await getSchedule(vehicle.id);
  return response.status(200).json({ vehicle, rental_count: rentals.length, rentals });
};

const getQuote = async (request, response) => {
  const vehicle = await findVehicle(readId(request.params.id));
  const quote = await quoteFor(vehicle, request.query.start_date, request.query.end_date);
  return response.status(200).json({ vehicle_id: vehicle.id, ...quote });
};

const createVehicle = async (request, response) => {
  const data = validateFields(request.body, true);
  const vehicle = unwrap(await request.db.from("vehicles").insert(data).select().single());
  return response.status(201).json({ message: "Vehicle added!", vehicle });
};

const updateVehicle = async (request, response) => {
  const id = readId(request.params.id);
  const data = validateFields(request.body, false);
  const vehicle = await findVehicle(id);

  if (data.status && vehicle.status === "rented") {
    throw new HttpError(400, "This vehicle is out on a rental. Complete the rental first!");
  }

  const updated = unwrap(await request.db.from("vehicles").update(data).eq("id", id).select().maybeSingle());
  if (!updated) throw new HttpError(404, "Vehicle not found!");
  return response.status(200).json({ message: "Vehicle updated!", vehicle: updated });
};

const deleteVehicle = async (request, response) => {
  const id = readId(request.params.id);
  await findVehicle(id);

  const open = unwrap(
    await request.db.from("rentals").select("id, start_date, end_date, status").eq("vehicle_id", id).in("status", ["booked", "active"]),
  );
  if (open.length > 0) {
    throw new HttpError(400, "Vehicle has active bookings, cancel or complete them first!", { bookings: open });
  }

  const { data, error } = await request.db.from("vehicles").delete().eq("id", id).select().maybeSingle();
  if (error && (error.code === "23001" || error.code === "23503")) {
    throw new HttpError(400, "Vehicle has past rental records and cannot be deleted. Set it to maintenance instead!");
  }
  const vehicle = unwrap({ data, error });
  if (!vehicle) throw new HttpError(404, "Vehicle not found!");
  return response.status(200).json({ message: "Vehicle deleted!", vehicle });
};

module.exports = {
  getVehicles,
  getVehicleById,
  getQuote,
  createVehicle,
  updateVehicle,
  deleteVehicle,
};
