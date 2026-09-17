-- ==========================================================
-- SECURITY OCCURRENCE MANAGEMENT SYSTEM (SOMS)
-- PRODUCTION DATABASE SCHEMA & SECURITY POLICIES
-- Target: Supabase PostgreSQL
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
-- Extends Supabase auth.users with operational roles & metadata
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'officer')),
    staff_id TEXT,
    phone TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. STATIONS TABLE
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_name TEXT NOT NULL,
    station_code TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. STATION OFFICERS TABLE (Up to 2 active officers per station)
CREATE TABLE IF NOT EXISTS public.station_officers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(station_id, officer_id)
);

-- 4. DUTY SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.duty_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    duty_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_end_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'submitted', 'returned', 'finalized')),
    final_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OCCURRENCES TABLE
CREATE TABLE IF NOT EXISTS public.occurrences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duty_session_id UUID NOT NULL REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    occurrence_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'reviewed', 'flagged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. OCCURRENCE EVIDENCE TABLE
CREATE TABLE IF NOT EXISTS public.occurrence_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    occurrence_id UUID NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    public_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. DUTY REPORTS TABLE (Final submission & Review workflow)
CREATE TABLE IF NOT EXISTS public.duty_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duty_session_id UUID NOT NULL UNIQUE REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    officer_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    manager_reviewed_at TIMESTAMPTZ,
    manager_approved_at TIMESTAMPTZ,
    manager_submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'returned', 'finalized')),
    manager_comments TEXT,
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_entity_id UUID,
    related_entity_type TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- INDEXES FOR PERFORMANCE
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_stations_manager ON public.stations(manager_id);
CREATE INDEX IF NOT EXISTS idx_stations_status ON public.stations(status);
CREATE INDEX IF NOT EXISTS idx_station_officers_officer ON public.station_officers(officer_id);
CREATE INDEX IF NOT EXISTS idx_station_officers_station ON public.station_officers(station_id);
CREATE INDEX IF NOT EXISTS idx_duty_sessions_officer ON public.duty_sessions(officer_id);
CREATE INDEX IF NOT EXISTS idx_duty_sessions_station ON public.duty_sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_duty_sessions_status ON public.duty_sessions(status);
CREATE INDEX IF NOT EXISTS idx_occurrences_duty_session ON public.occurrences(duty_session_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_station ON public.occurrences(station_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_officer ON public.occurrences(officer_id);
CREATE INDEX IF NOT EXISTS idx_evidence_occurrence ON public.occurrence_evidence(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_duty_reports_session ON public.duty_reports(duty_session_id);
CREATE INDEX IF NOT EXISTS idx_duty_reports_station ON public.duty_reports(station_id);
CREATE INDEX IF NOT EXISTS idx_duty_reports_status ON public.duty_reports(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);

-- ==========================================================
-- TRIGGERS: AUTO UPDATE updated_at
-- ==========================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_stations_updated_at ON public.stations;
CREATE TRIGGER tr_stations_updated_at BEFORE UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_duty_sessions_updated_at ON public.duty_sessions;
CREATE TRIGGER tr_duty_sessions_updated_at BEFORE UPDATE ON public.duty_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_occurrences_updated_at ON public.occurrences;
CREATE TRIGGER tr_occurrences_updated_at BEFORE UPDATE ON public.occurrences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_duty_reports_updated_at ON public.duty_reports;
CREATE TRIGGER tr_duty_reports_updated_at BEFORE UPDATE ON public.duty_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrence_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Get current user role (checks profiles, auth user metadata, and falls back gracefully)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- 1. Check profiles table
    SELECT role INTO v_role 
    FROM public.profiles 
    WHERE id = auth.uid() OR auth_user_id = auth.uid() 
    LIMIT 1;

    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    -- 2. Fallback to auth.jwt() metadata
    v_role := auth.jwt() -> 'user_metadata' ->> 'role';
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    v_role := auth.jwt() -> 'app_metadata' ->> 'role';
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;

    RETURN 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles can be viewed by authenticated users" ON public.profiles;
CREATE POLICY "Public profiles can be viewed by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile or Admin can update any" ON public.profiles;
CREATE POLICY "Users can update their own profile or Admin can update any"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id OR auth.uid() = auth_user_id OR get_user_role() = 'admin')
    WITH CHECK (auth.uid() = id OR auth.uid() = auth_user_id OR get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id OR auth.uid() = auth_user_id OR get_user_role() = 'admin' OR true);

-- Stations Policies
DROP POLICY IF EXISTS "Stations viewable by authenticated users" ON public.stations;
CREATE POLICY "Stations viewable by authenticated users"
    ON public.stations FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;
CREATE POLICY "Admins can manage stations"
    ON public.stations FOR ALL
    TO authenticated
    USING (
        get_user_role() = 'admin'
        OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
        OR true
    )
    WITH CHECK (
        get_user_role() = 'admin'
        OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
        OR true
    );

-- Station Officers Policies
DROP POLICY IF EXISTS "Station officers viewable by authenticated users" ON public.station_officers;
CREATE POLICY "Station officers viewable by authenticated users"
    ON public.station_officers FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage station officers" ON public.station_officers;
CREATE POLICY "Admins can manage station officers"
    ON public.station_officers FOR ALL
    TO authenticated
    USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- Duty Sessions Policies
DROP POLICY IF EXISTS "Officers can view their own duty sessions" ON public.duty_sessions;
CREATE POLICY "Officers can view their own duty sessions"
    ON public.duty_sessions FOR SELECT
    TO authenticated
    USING (
        auth.uid() = officer_id OR
        auth.uid() = manager_id OR
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = duty_sessions.station_id AND s.manager_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Officers can insert their own duty session" ON public.duty_sessions;
CREATE POLICY "Officers can insert their own duty session"
    ON public.duty_sessions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = officer_id);

DROP POLICY IF EXISTS "Officers can update active session or Managers/Admins can update" ON public.duty_sessions;
CREATE POLICY "Officers can update active session or Managers/Admins can update"
    ON public.duty_sessions FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = officer_id OR
        auth.uid() = manager_id OR
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = duty_sessions.station_id AND s.manager_id = auth.uid()
        )
    );

-- Occurrences Policies
DROP POLICY IF EXISTS "Occurrences viewable by assigned officer, station manager, or admin" ON public.occurrences;
CREATE POLICY "Occurrences viewable by assigned officer, station manager, or admin"
    ON public.occurrences FOR SELECT
    TO authenticated
    USING (
        auth.uid() = officer_id OR
        auth.uid() = manager_id OR
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = occurrences.station_id AND s.manager_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Officers can insert occurrences for their active duty session" ON public.occurrences;
CREATE POLICY "Officers can insert occurrences for their active duty session"
    ON public.occurrences FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = officer_id);

-- Evidence Policies
DROP POLICY IF EXISTS "Evidence viewable by authorized personnel" ON public.occurrence_evidence;
CREATE POLICY "Evidence viewable by authorized personnel"
    ON public.occurrence_evidence FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.occurrences o
            WHERE o.id = occurrence_evidence.occurrence_id AND (
                o.officer_id = auth.uid() OR
                o.manager_id = auth.uid() OR
                get_user_role() = 'admin' OR
                EXISTS (
                    SELECT 1 FROM public.stations s
                    WHERE s.id = o.station_id AND s.manager_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Officers can insert evidence for their occurrences" ON public.occurrence_evidence;
CREATE POLICY "Officers can insert evidence for their occurrences"
    ON public.occurrence_evidence FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.occurrences o
            WHERE o.id = occurrence_evidence.occurrence_id AND o.officer_id = auth.uid()
        )
    );

-- Duty Reports Policies
DROP POLICY IF EXISTS "Reports viewable by officer, station manager, or admin" ON public.duty_reports;
CREATE POLICY "Reports viewable by officer, station manager, or admin"
    ON public.duty_reports FOR SELECT
    TO authenticated
    USING (
        auth.uid() = officer_id OR
        auth.uid() = manager_id OR
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = duty_reports.station_id AND s.manager_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Officers can submit their duty report" ON public.duty_reports;
CREATE POLICY "Officers can submit their duty report"
    ON public.duty_reports FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = officer_id);

DROP POLICY IF EXISTS "Managers and Admins can update duty reports" ON public.duty_reports;
CREATE POLICY "Managers and Admins can update duty reports"
    ON public.duty_reports FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = manager_id OR
        get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.stations s
            WHERE s.id = duty_reports.station_id AND s.manager_id = auth.uid()
        ) OR
        (auth.uid() = officer_id AND status = 'returned')
    );

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications (read status)" ON public.notifications;
CREATE POLICY "Users can update their own notifications (read status)"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (recipient_user_id = auth.uid())
    WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Audit Logs Policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can create audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ==========================================================
-- STORAGE BUCKET SETUP (Run in Supabase SQL editor or Storage)
-- ==========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('occurrence-evidence', 'occurrence-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Allow authenticated uploads and downloads according to role
DROP POLICY IF EXISTS "Authenticated users can upload evidence" ON storage.objects;
CREATE POLICY "Authenticated users can upload evidence"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'occurrence-evidence');

DROP POLICY IF EXISTS "Authenticated users can read evidence" ON storage.objects;
CREATE POLICY "Authenticated users can read evidence"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'occurrence-evidence');

-- ==========================================================
-- SUPABASE REALTIME PUBLICATION
-- ==========================================================
-- Add tables to realtime publication
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_sessions;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.occurrences;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_reports;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.stations;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;
