-- Fix 1: Allow admins to read ALL portfolios (not just their own)
CREATE POLICY "admin_read_all_portfolios"
  ON public.portfolios FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Fix 2: Allow admins to update any portfolio (for reset feature)
CREATE POLICY "admin_update_portfolios"
  ON public.portfolios FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Fix 3: Allow admins to delete any portfolio
CREATE POLICY "admin_delete_portfolios"
  ON public.portfolios FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Verify: count all portfolios visible to current admin session
SELECT COUNT(*) as total_users FROM public.portfolios;
