DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;

CREATE TABLE public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select" ON public.admin_users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admins_insert" ON public.admin_users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'azozsaleh@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tech', 'admin', 'urgent')),
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select" ON public.announcements
  FOR SELECT USING (true);

CREATE POLICY "announcements_insert" ON public.announcements
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "announcements_delete" ON public.announcements
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

SELECT u.email, au.user_id, au.created_at
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id;
