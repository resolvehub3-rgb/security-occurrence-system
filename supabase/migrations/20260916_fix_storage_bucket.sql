-- Create the evidence storage bucket as PUBLIC (required for getPublicUrl)
INSERT INTO storage.buckets (id, name, public)
VALUES ('occurrence-evidence', 'occurrence-evidence', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read evidence" ON storage.objects;

-- Allow authenticated users to upload evidence files
CREATE POLICY "Authenticated users can upload evidence"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'occurrence-evidence');

-- Allow authenticated users to read evidence files
CREATE POLICY "Authenticated users can read evidence"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'occurrence-evidence');

-- Allow public read access (needed for getPublicUrl)
DROP POLICY IF EXISTS "Public can read evidence" ON storage.objects;
CREATE POLICY "Public can read evidence"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'occurrence-evidence');
