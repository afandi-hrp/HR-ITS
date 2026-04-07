-- Allow public inserts to external_data
CREATE POLICY "Allow public inserts" ON external_data FOR INSERT WITH CHECK (true);
