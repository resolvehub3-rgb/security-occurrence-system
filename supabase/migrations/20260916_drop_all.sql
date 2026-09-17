-- Drop all tables and functions in reverse order of dependencies
-- Run this in Supabase SQL Editor BEFORE re-running the migration

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.duty_reports CASCADE;
DROP TABLE IF EXISTS public.occurrence_evidence CASCADE;
DROP TABLE IF EXISTS public.occurrences CASCADE;
DROP TABLE IF EXISTS public.duty_sessions CASCADE;
DROP TABLE IF EXISTS public.station_officers CASCADE;
DROP TABLE IF EXISTS public.stations CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop the helper function
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Remove from realtime publication (ignores if not present)
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.duty_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.occurrences; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.duty_reports; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.stations; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Drop storage bucket policy if exists
DELETE FROM storage.buckets WHERE id = 'occurrence-evidence';
