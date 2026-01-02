# Vercel deployment notes (MongoDB / Mongoose)

If you see errors like:

- `Operation users.findOne() buffering timed out after 10000ms`

it means the serverless function **never connected to MongoDB**.

## Required Vercel env vars

This backend enforces required env vars on startup in `src/config/env.ts`. At minimum you must set these in Vercel (**Production** + **Preview**, if you use previews):

- `MONGODB_URI`
- `JWT_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (use `\n` for newlines)

Other features (payments/email/cloudinary) require additional variables.

## MongoDB must be reachable from Vercel

Your `MONGODB_URI` **cannot** point to private/local addresses such as:

- `mongodb://localhost:...`
- `mongodb://127.0.0.1:...`
- `*.internal` (for example Railway internal hostnames)

Use a **publicly reachable** MongoDB URL:

- MongoDB Atlas (recommended), or
- a hosted Mongo instance with public networking enabled

### MongoDB Atlas checklist

- Network Access: allow inbound connections from the internet (Atlas often uses `0.0.0.0/0` for Vercel since Vercel IPs are not fixed).
- Database user exists and has permissions on the target DB.

## Vercel routing

This repo includes a serverless function entrypoint at:

- `api/[...path].ts`

It handles all requests under `/api/*`.


