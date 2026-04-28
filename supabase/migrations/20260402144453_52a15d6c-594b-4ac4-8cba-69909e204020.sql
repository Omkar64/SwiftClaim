
ALTER TABLE public.claims
ADD COLUMN image_latitude double precision DEFAULT NULL,
ADD COLUMN image_longitude double precision DEFAULT NULL,
ADD COLUMN image_timestamp timestamp with time zone DEFAULT NULL,
ADD COLUMN image_metadata_valid boolean DEFAULT NULL;
