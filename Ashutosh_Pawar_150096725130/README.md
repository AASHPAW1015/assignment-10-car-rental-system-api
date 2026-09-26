# Car Rental and Fleet Booking API

Assignment 10 - Ashutosh Pawar (150096725130)

REST API for renting cars, built on Supabase. Supabase Auth handles sign up
and login, and the Supabase access token protects every private route.
Customers browse the fleet, get a price quote, book a car for a date range and
cancel upcoming bookings. Admins manage the fleet, hand cars over and mark them
returned. A car can never be double booked: the server checks for overlapping
dates first, and a Postgres exclusion constraint rejects any overlap that gets
past that check. The total cost is `days x daily_rate`, worked out on the
server. A plain HTML frontend in `public/` is served by the same server.


## Live demo

https://assignment-10-car-rental-system-api-et15.onrender.com

The UI and the API run as one Render web service on the free tier, with the
database and auth in Supabase. The first visit after a period of inactivity can
take up to a minute while the server wakes up. Deployed with root directory
`Ashutosh_Pawar_150096725130`, build `npm install`, start `npm start`, and
`SUPABASE_URL` plus `SUPABASE_ANON_KEY` (the publishable key, so row level
security still applies) set in the Render environment.

## Tech stack

- Node.js, Express 5
- Supabase: PostgreSQL, Auth, Row Level Security
- @supabase/supabase-js
- dotenv, cors
- HTML + fetch + SweetAlert2 for the frontend

## Project structure

```text
Ashutosh_Pawar_150096725130/
├── config/
│   └── supabase.js                   # shared client, per-request client with the user's token
├── controllers/
│   ├── authController.js             # register, login, profile through Supabase Auth
│   ├── rentalController.js           # booking, cost, cancel, start, complete
│   └── vehicleController.js          # fleet CRUD, filters, quote, free-for-dates search
├── middleware/
│   ├── auth.js                       # verifyToken (Supabase token), requireAdmin
│   └── errorHandler.js               # HttpError, unwrap, Postgres error mapping, 404 + 500
├── routes/
│   ├── authRoutes.js
│   ├── rentalRoutes.js
│   └── vehicleRoutes.js
├── utils/
│   ├── booking.js                    # date validation, overlap check, quote
│   └── dates.js                      # day count, overlap test, cost
├── public/                           # frontend pages + app.js
├── schema.sql                        # tables, constraints, triggers, RLS policies
├── car-rental-api.postman_collection.json
├── test.http
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of `schema.sql` and run it. It can be run
   again safely.
3. For testing, turn off **Authentication -> Sign In / Providers -> Email ->
   Confirm email**. Otherwise every new account has to click the email link
   before it can log in, and Supabase's built-in email service only sends a
   few emails per hour.
4. Install and start:

```bash
npm install
cp .env.example .env
npm run dev
```

- API: `http://localhost:3000/api/...`
- Frontend: `http://localhost:3000/index.html`

### Making an admin

Everyone who registers is a `customer`. Register the admin account normally,
then run this in the SQL Editor:

```sql
update profiles set role = 'admin' where email = 'admin@travel.com';
```

The role cannot be set from the API. Sending `"role": "admin"` when you
register does nothing.

## Environment variables

| Variable            | Example                              | Notes                              |
| ------------------- | ------------------------------------ | ---------------------------------- |
| `PORT`              | `3000`                               | Server port                        |
| `SUPABASE_URL`      | `https://abcd1234.supabase.co`       | Project Settings -> API            |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...`                      | The `anon` `public` key            |

Only the anon key is used. The server never needs the service role key, since
every query runs as the logged-in user and RLS decides what they can do.

## Database schema

### profiles

| Column       | Type        | Notes                                                      |
| ------------ | ----------- | ---------------------------------------------------------- |
| `id`         | uuid        | PK, FK to `auth.users(id)` on delete cascade               |
| `name`       | text        | from the name given at sign up                             |
| `email`      | text        | unique                                                     |
| `role`       | text        | `customer` (default) or `admin`                            |
| `created_at` | timestamptz |                                                            |

A trigger on `auth.users` creates the profile row whenever someone signs up.

### vehicles

| Column             | Type          | Notes                                                    |
| ------------------ | ------------- | -------------------------------------------------------- |
| `id`               | bigint        | identity PK                                              |
| `brand`, `model`   | text          | required                                                 |
| `year`             | int           | 1990 to 2100                                             |
| `category`         | text          | `Sedan`, `SUV`, `Luxury`, `Hatchback`, `Electric`        |
| `daily_rate`       | numeric(10,2) | greater than 0                                           |
| `fuel_type`        | text          | required                                                 |
| `seating_capacity` | int           | default 5, 1 to 15                                       |
| `status`           | text          | `available` (default), `rented`, `maintenance`           |
| `created_at`       | timestamptz   |                                                          |

### rentals

| Column           | Type          | Notes                                                    |
| ---------------- | ------------- | -------------------------------------------------------- |
| `id`             | bigint        | identity PK                                              |
| `user_id`        | uuid          | FK to `auth.users(id)` on delete restrict                |
| `vehicle_id`     | bigint        | FK to `vehicles(id)` on delete restrict, not null        |
| `customer_name`  | text          | defaults to the profile name                             |
| `customer_email` | text          | defaults to the account email                            |
| `start_date`     | date          |                                                          |
| `end_date`       | date          | `valid_date_range`: `end_date >= start_date`             |
| `total_cost`     | numeric(10,2) | greater than 0                                           |
| `status`         | text          | `booked` (default), `active`, `completed`, `cancelled`   |
| `created_at`     | timestamptz   |                                                          |

`no_double_booking` is an exclusion constraint (needs `btree_gist`):

```sql
exclude using gist (
  vehicle_id with =,
  daterange(start_date, end_date, '[]') with &&
) where (status in ('booked', 'active'))
```

No two `booked`/`active` rentals of the same car can have overlapping date
ranges. `cancelled` and `completed` rentals do not block dates.

### Database functions

| Function                         | Used for                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `vehicle_schedule(vehicle_id)`   | Dates and status of a car's rentals, without customer details  |
| `busy_vehicle_ids(start, end)`   | Cars that are taken for a date range                           |
| `is_admin()`                     | Used inside the RLS policies                                   |
| `guard_rental_write()` trigger   | Checks `total_cost` on insert, limits what customers can update |

## Authentication and security

Register and login go through Supabase Auth. Login returns the Supabase access
token:

```
Authorization: Bearer <token>
```

`verifyToken` checks the token with `supabase.auth.getUser`, loads the
profile, and creates a Supabase client that sends that same token. All queries
for that request run as that user, so Postgres RLS applies to everything the
API does. `requireAdmin` blocks non-admins before the controller runs, and RLS
blocks them again in the database.

| Rule (RLS and triggers)                                        | Effect                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| Anyone can read `vehicles`                                     | Public catalogue                            |
| Only admins can insert, update or delete `vehicles`            | Customers get `403`                         |
| Rentals are visible to their owner and to admins               | Other users' rentals return `404`           |
| A rental can only be inserted with `user_id = auth.uid()`      | You cannot book in someone else's name      |
| Customers can only change `status` from `booked` to `cancelled` | No editing dates, cost or status otherwise  |
| Insert trigger checks `total_cost = daily_rate x days`         | A forged price is rejected                  |

| Situation                   | Response                                            |
| --------------------------- | --------------------------------------------------- |
| No token                    | `401 No token provided!`                            |
| Bad or expired token        | `401 Invalid or expired token, please login again!` |
| Customer on an admin route  | `403 Admins only!`                                  |

## Endpoints

### Auth

| Method | Route                | Token | Description                              |
| ------ | -------------------- | ----- | ---------------------------------------- |
| POST   | `/api/auth/register` | none  | Register with `{ name, email, password }` |
| POST   | `/api/auth/login`    | none  | Returns `token`, `expires_at`, `user`    |
| GET    | `/api/auth/profile`  | any   | Current profile                          |

### Vehicles

| Method | Route                     | Token | Description                                               |
| ------ | ------------------------- | ----- | --------------------------------------------------------- |
| GET    | `/api/vehicles`           | none  | Fleet, cheapest first                                     |
| GET    | `/api/vehicles/:id`       | none  | Details and rental history                                |
| GET    | `/api/vehicles/:id/quote` | none  | Days, cost and availability for `?start_date=&end_date=`  |
| POST   | `/api/vehicles`           | admin | Add vehicle                                               |
| PUT    | `/api/vehicles/:id`       | admin | Update rate, status or any other field                    |
| DELETE | `/api/vehicles/:id`       | admin | Delete vehicle                                            |

`GET /api/vehicles` query options: `category`, `status`, and
`start_date` + `end_date` to list only cars that are free for that whole range
and not in maintenance.

`status` can only be set to `available` or `maintenance` through `PUT`. It
cannot be changed while the car is `rented`. `rented` is set by starting a
rental.

A vehicle with `booked` or `active` rentals cannot be deleted (`400`). A
vehicle with past rentals cannot be deleted either, because of
`ON DELETE RESTRICT`. Set it to `maintenance` instead.

### Rentals

| Method | Route                        | Token     | Description                                          |
| ------ | ---------------------------- | --------- | ---------------------------------------------------- |
| POST   | `/api/rentals`               | any       | Book a vehicle                                       |
| GET    | `/api/rentals/my-bookings`   | any       | Own rentals with vehicle details, `?status=` filter  |
| GET    | `/api/rentals`               | admin     | All rentals, `?status=` and `?vehicle_id=` filters   |
| GET    | `/api/rentals/:id`           | owner/admin | One rental                                         |
| PATCH  | `/api/rentals/:id/cancel`    | owner/admin | Cancel a `booked` rental                           |
| PATCH  | `/api/rentals/:id/start`     | admin     | Car handed over: rental `active`, car `rented`       |
| PATCH  | `/api/rentals/:id/complete`  | admin     | Car returned: rental `completed`, car `available`    |

Book body:

```json
{
  "vehicle_id": 1,
  "start_date": "2026-10-01",
  "end_date": "2026-10-05",
  "customer_name": "David",
  "customer_email": "david@test.com"
}
```

Response includes `billing: { days: 5, daily_rate: 4500, total_cost: 22500 }`
and the rental joined with its vehicle.

## How it works

- **Day count and cost.** Dates are inclusive, the same way the exclusion
  constraint's `'[]'` range works. `2026-10-01` to `2026-10-05` is 5 days. A
  same-day rental is 1 day. Days are counted in UTC, so daylight saving
  changes do not affect them. `total_cost = daily_rate x days`, rounded to
  paise.
- **Collision check.** Two ranges overlap when
  `startA <= endB && startB <= endA`. Before inserting, the API gets the car's
  schedule and compares the new range with every `booked`/`active` rental. On
  a clash it returns `400 Vehicle already reserved during this timeframe` and
  the clashing dates. So `05-01 -> 05-05` blocks `05-03 -> 05-07`, blocks
  `05-05 -> 05-06` (shared last day), and allows `05-06 -> 05-07`.
- **Race safety.** If two people book the same dates at the same moment, both
  can pass the check. The exclusion constraint lets only one insert through.
  The other gets Postgres error `23P01`, which the error handler turns into
  the same `400`.
- **Booking rules.** `start_date` cannot be in the past, `end_date` cannot be
  before `start_date`, a rental is at most 60 days, and a car in
  `maintenance` cannot be booked.
- **Fleet status.**

  ```
  rental:  booked -> active -> completed
           booked -> cancelled
  vehicle: available -> rented (start) -> available (complete)
           available <-> maintenance (admin PUT)
  ```

  Starting is allowed between the rental's start and end dates, and only while
  the car is `available`. Status changes use conditional updates
  (`.eq("status", from)`), so two admins clicking at once cannot both apply
  the same change.
- **Errors.** Controllers throw `HttpError`. Express 5 passes rejected
  promises to `errorHandler`, which maps Postgres codes (`23P01`, `23001`,
  `23503`, `23514`, `42501`, ...) to clear `4xx` responses. Unknown errors
  become `500 Something went wrong` and are logged.

## Status codes

| Code | When                                                                       |
| ---- | -------------------------------------------------------------------------- |
| 200  | Success                                                                    |
| 201  | Account, vehicle or rental created                                         |
| 400  | Validation error, date collision, cannot cancel, has active bookings, bad JSON |
| 401  | No token, bad token, wrong login                                           |
| 403  | Customer on an admin route                                                 |
| 404  | Vehicle, rental or route not found (and other users' rentals)              |
| 409  | Status was changed by someone else at the same time                        |
| 429  | Supabase Auth rate limit hit                                               |
| 500  | Unexpected server error                                                    |

## Testing

- `car-rental-api.postman_collection.json`: import into Postman and run top to
  bottom. The collection sets the dates relative to today, so it always
  works. It covers all three accounts, `403`/`404` access checks, the date
  conflict tests (overlap, shared last day, back to back) and the full rental
  lifecycle. Promote `admin@travel.com` with the SQL above after the
  "Register Admin" request.
- `test.http`: the same requests for the VS Code REST Client.

Validation steps from the assignment:

1. Put the Supabase keys in `.env` and run `schema.sql`.
2. Add 3 vehicles as the admin.
3. Book vehicle 1 for a 5 day range.
4. Book vehicle 1 again for a range that overlaps it. The response is
   `400 Vehicle already reserved during this timeframe`.

The assignment's example dates (`2026-05-01` to `2026-05-05`) are now in the
past, and the API does not accept bookings that start in the past, so the
Postman collection uses today to today+4 and today+2 to today+6 instead.

Frontend: `index.html` lists the fleet with filters and a free-for-dates
search. `vehicle.html` shows the details, rental history, a live price quote
and the booking form. Customers get My Bookings. Admins also get Add Vehicle
and All Rentals, where they hand cars over and mark them returned.
