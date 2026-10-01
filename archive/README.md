# Previous backend configuration

`supabase/` contains the previous SQL schema and local service configuration for reference only. The application no longer imports its SDK or connects to those services. The current backend is `backend/` (Flask + SQLAlchemy).

The former local services were stopped with their database volumes preserved; no database volume was deleted. Use `npm run backend:start` for the current server.
