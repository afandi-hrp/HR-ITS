CREATE OR REPLACE FUNCTION get_unique_positions()
RETURNS TABLE ("position" text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT c.position FROM candidates c WHERE c.position IS NOT NULL AND c.position != ''
  UNION
  SELECT DISTINCT l.position FROM candidate_logs l WHERE l.position IS NOT NULL AND l.position != '';
END;
$$;
