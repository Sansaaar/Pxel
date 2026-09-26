-- Pixel Whiteboard persistence. Run once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS public.pixel_whiteboards (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL DEFAULT 'Untitled whiteboard',
    document    JSONB       NOT NULL DEFAULT '{"objects": []}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pixel_whiteboards_document_is_object
        CHECK (jsonb_typeof(document) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_pixel_whiteboards_owner_updated
    ON public.pixel_whiteboards (user_id, updated_at DESC);

ALTER TABLE public.pixel_whiteboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pixel_whiteboards_select_own" ON public.pixel_whiteboards;
DROP POLICY IF EXISTS "pixel_whiteboards_insert_own" ON public.pixel_whiteboards;
DROP POLICY IF EXISTS "pixel_whiteboards_update_own" ON public.pixel_whiteboards;
DROP POLICY IF EXISTS "pixel_whiteboards_delete_own" ON public.pixel_whiteboards;

CREATE POLICY "pixel_whiteboards_select_own"
    ON public.pixel_whiteboards FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "pixel_whiteboards_insert_own"
    ON public.pixel_whiteboards FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "pixel_whiteboards_update_own"
    ON public.pixel_whiteboards FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "pixel_whiteboards_delete_own"
    ON public.pixel_whiteboards FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.pixel_whiteboards TO authenticated;
