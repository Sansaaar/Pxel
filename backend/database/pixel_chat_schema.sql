-- ================================================================
-- Pixel AI 2.0 – Secure Production User Chat Schema
-- Rerunnable, Idempotent & PostgreSQL Compliant
-- Uses Supabase Auth (auth.uid()) for strict Row Level Security (RLS)
-- ================================================================

-- ── 1. Create Tables ─────────────────────────────────────────────

-- 1.1 Users Registry (Public profile info for chat system)
CREATE TABLE IF NOT EXISTS public.pixel_chat_users (
    id            TEXT        PRIMARY KEY,          -- Matches auth.uid() or user ID
    email         TEXT        NOT NULL DEFAULT '',
    display_name  TEXT        NOT NULL DEFAULT 'Pixel User',
    avatar        TEXT        NOT NULL DEFAULT 'P',
    is_online     BOOLEAN     NOT NULL DEFAULT false,
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 Conversations (Direct DMs or Rooms)
CREATE TABLE IF NOT EXISTS public.pixel_chat_conversations (
    id            TEXT        PRIMARY KEY,          -- 'direct_<uid1>_<uid2>' or 'room_<code>'
    type          TEXT        NOT NULL CHECK (type IN ('direct','room')),
    code          TEXT        UNIQUE,               -- PIXEL-XXXXX room code
    name          TEXT        NOT NULL DEFAULT 'Chat',
    topic         TEXT        NOT NULL DEFAULT '',
    owner_id      TEXT        REFERENCES public.pixel_chat_users(id) ON DELETE SET NULL,
    last_message  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3 Room / Direct Members (Join Table)
CREATE TABLE IF NOT EXISTS public.pixel_chat_room_members (
    conversation_id TEXT NOT NULL REFERENCES public.pixel_chat_conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES public.pixel_chat_users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- 1.4 Messages
CREATE TABLE IF NOT EXISTS public.pixel_chat_messages (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id         TEXT        NOT NULL REFERENCES public.pixel_chat_conversations(id) ON DELETE CASCADE,
    sender_id       TEXT        NOT NULL,           -- user_id or 'system'
    sender_name     TEXT        NOT NULL DEFAULT 'Pixel User',
    sender_avatar   TEXT        NOT NULL DEFAULT 'P',
    content         TEXT        NOT NULL DEFAULT '',
    attachments     JSONB       NOT NULL DEFAULT '[]',
    reactions       JSONB       NOT NULL DEFAULT '{}',
    is_edited       BOOLEAN     NOT NULL DEFAULT false,
    is_deleted      BOOLEAN     NOT NULL DEFAULT false,
    read_by         TEXT[]      NOT NULL DEFAULT '{}',
    reply_to        TEXT        REFERENCES public.pixel_chat_messages(id) ON DELETE SET NULL,
    pinned          BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.5 Ephemeral Typing Indicators
CREATE TABLE IF NOT EXISTS public.pixel_chat_typing (
    chat_id    TEXT NOT NULL REFERENCES public.pixel_chat_conversations(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES public.pixel_chat_users(id) ON DELETE CASCADE,
    user_name  TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

-- ── 2. Create Performance Indexes ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pixel_chat_conv_code     ON public.pixel_chat_conversations(code);
CREATE INDEX IF NOT EXISTS idx_pixel_chat_conv_type     ON public.pixel_chat_conversations(type);
CREATE INDEX IF NOT EXISTS idx_pixel_chat_conv_updated  ON public.pixel_chat_conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pixel_chat_members_user ON public.pixel_chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pixel_chat_members_conv ON public.pixel_chat_room_members(conversation_id);

CREATE INDEX IF NOT EXISTS idx_pixel_chat_msg_chat    ON public.pixel_chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pixel_chat_msg_sender  ON public.pixel_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_pixel_chat_msg_pinned  ON public.pixel_chat_messages(chat_id, pinned) WHERE pinned = true;

-- ── 3. Enable Row Level Security (RLS) ────────────────────────────

ALTER TABLE public.pixel_chat_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_chat_room_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_chat_typing        ENABLE ROW LEVEL SECURITY;

-- ── 4. Drop Existing Policies (Idempotent Rerunnable Execution) ────

-- pixel_chat_users policies
DROP POLICY IF EXISTS "chat_users_select_authenticated" ON public.pixel_chat_users;
DROP POLICY IF EXISTS "chat_users_insert_self" ON public.pixel_chat_users;
DROP POLICY IF EXISTS "chat_users_update_self" ON public.pixel_chat_users;
DROP POLICY IF EXISTS "allow_all_anon_read_users" ON public.pixel_chat_users;

-- pixel_chat_conversations policies
DROP POLICY IF EXISTS "chat_conv_select_members" ON public.pixel_chat_conversations;
DROP POLICY IF EXISTS "chat_conv_insert_authenticated" ON public.pixel_chat_conversations;
DROP POLICY IF EXISTS "chat_conv_update_members" ON public.pixel_chat_conversations;
DROP POLICY IF EXISTS "chat_conv_delete_owner" ON public.pixel_chat_conversations;
DROP POLICY IF EXISTS "allow_all_anon_read_conversations" ON public.pixel_chat_conversations;

-- pixel_chat_room_members policies
DROP POLICY IF EXISTS "chat_members_select" ON public.pixel_chat_room_members;
DROP POLICY IF EXISTS "chat_members_insert" ON public.pixel_chat_room_members;
DROP POLICY IF EXISTS "chat_members_delete" ON public.pixel_chat_room_members;
DROP POLICY IF EXISTS "allow_all_anon_read_members" ON public.pixel_chat_room_members;

-- pixel_chat_messages policies
DROP POLICY IF EXISTS "chat_msg_select_members" ON public.pixel_chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert_sender" ON public.pixel_chat_messages;
DROP POLICY IF EXISTS "chat_msg_update_members" ON public.pixel_chat_messages;
DROP POLICY IF EXISTS "chat_msg_delete_sender_or_owner" ON public.pixel_chat_messages;
DROP POLICY IF EXISTS "allow_all_anon_read_messages" ON public.pixel_chat_messages;

-- pixel_chat_typing policies
DROP POLICY IF EXISTS "chat_typing_select" ON public.pixel_chat_typing;
DROP POLICY IF EXISTS "chat_typing_all_self" ON public.pixel_chat_typing;
DROP POLICY IF EXISTS "allow_all_anon_read_typing" ON public.pixel_chat_typing;
DROP POLICY IF EXISTS "allow_anon_typing_upsert" ON public.pixel_chat_typing;

-- ── 5. Define Secure RLS Policies ─────────────────────────────────

-- SECURITY DEFINER helpers avoid recursive policies on the membership table.
CREATE OR REPLACE FUNCTION public.pixel_chat_is_member(p_conversation_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pixel_chat_room_members m
        WHERE m.conversation_id = p_conversation_id
          AND m.user_id = auth.uid()::text
    );
$$;

CREATE OR REPLACE FUNCTION public.pixel_chat_is_owner(p_conversation_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pixel_chat_conversations c
        WHERE c.id = p_conversation_id
          AND c.owner_id = auth.uid()::text
    );
$$;

REVOKE ALL ON FUNCTION public.pixel_chat_is_member(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pixel_chat_is_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pixel_chat_is_member(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pixel_chat_is_owner(TEXT) TO authenticated;

-- 5.1 Users:
-- Account profiles are read by the authenticated backend, not exposed to anonymous clients.
CREATE POLICY "chat_users_select_authenticated"
    ON public.pixel_chat_users FOR SELECT
    TO authenticated
    USING (id = (auth.uid())::text);

-- Users can only insert their own profile
CREATE POLICY "chat_users_insert_self"
    ON public.pixel_chat_users FOR INSERT
    TO authenticated
    WITH CHECK (id = (auth.uid())::text);

-- Users can only update their own profile
CREATE POLICY "chat_users_update_self"
    ON public.pixel_chat_users FOR UPDATE
    TO authenticated
    USING (id = (auth.uid())::text)
    WITH CHECK (id = (auth.uid())::text);

-- 5.2 Conversations:
-- A user can only see conversations they belong to
CREATE POLICY "chat_conv_select_members"
    ON public.pixel_chat_conversations FOR SELECT
    TO authenticated
    USING (public.pixel_chat_is_member(id));

-- Any user can create a new room or DM
CREATE POLICY "chat_conv_insert_authenticated"
    ON public.pixel_chat_conversations FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = (auth.uid())::text);

-- Members can update conversation metadata (e.g. topic, last_message)
CREATE POLICY "chat_conv_update_members"
    ON public.pixel_chat_conversations FOR UPDATE
    TO authenticated
    USING (public.pixel_chat_is_owner(id))
    WITH CHECK (public.pixel_chat_is_owner(id));

-- Only room creator can delete a room
CREATE POLICY "chat_conv_delete_owner"
    ON public.pixel_chat_conversations FOR DELETE
    TO authenticated
    USING (public.pixel_chat_is_owner(id));

-- 5.3 Members:
-- Members of a conversation can see fellow members
CREATE POLICY "chat_members_select"
    ON public.pixel_chat_room_members FOR SELECT
    TO authenticated
    USING (public.pixel_chat_is_member(conversation_id));

-- Users can leave (delete self) or room owner can kick members
CREATE POLICY "chat_members_delete"
    ON public.pixel_chat_room_members FOR DELETE
    TO authenticated
    USING (
        user_id = (auth.uid())::text
        OR public.pixel_chat_is_owner(conversation_id)
    );

-- 5.4 Messages:
-- Users can only read messages from conversations they belong to
CREATE POLICY "chat_msg_select_members"
    ON public.pixel_chat_messages FOR SELECT
    TO authenticated
    USING (public.pixel_chat_is_member(chat_id));

-- Users can only send messages as themselves to conversations they belong to
CREATE POLICY "chat_msg_insert_sender"
    ON public.pixel_chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = (auth.uid())::text
        AND public.pixel_chat_is_member(chat_id)
    );

-- Members can update reactions/read_by; original sender can edit content
CREATE POLICY "chat_msg_update_members"
    ON public.pixel_chat_messages FOR UPDATE
    TO authenticated
    USING (
        sender_id = (auth.uid())::text
        AND public.pixel_chat_is_member(chat_id)
    )
    WITH CHECK (
        sender_id = (auth.uid())::text
        AND public.pixel_chat_is_member(chat_id)
    );

-- Sender or room owner can delete message
CREATE POLICY "chat_msg_delete_sender_or_owner"
    ON public.pixel_chat_messages FOR DELETE
    TO authenticated
    USING (
        sender_id = (auth.uid())::text
        OR public.pixel_chat_is_owner(chat_id)
    );

-- 5.5 Typing Indicators:
CREATE POLICY "chat_typing_select"
    ON public.pixel_chat_typing FOR SELECT
    TO authenticated
    USING (public.pixel_chat_is_member(chat_id));

CREATE POLICY "chat_typing_all_self"
    ON public.pixel_chat_typing FOR ALL
    TO authenticated
    USING (
        user_id = (auth.uid())::text
        AND public.pixel_chat_is_member(chat_id)
    )
    WITH CHECK (
        user_id = (auth.uid())::text
        AND public.pixel_chat_is_member(chat_id)
    );

-- ── 6. Storage Bucket & Private Attachment Policies ───────────────

-- Create private bucket for attachments (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pixel-chat-attachments',
    'pixel-chat-attachments',
    false,
    5242880,
    ARRAY[
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'application/pdf', 'application/json', 'text/plain', 'text/markdown', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'video/mp4', 'video/webm'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop existing storage policies for clean rerun
DROP POLICY IF EXISTS "chat_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_storage_insert" ON storage.objects;

-- Allow reading attachments from pixel-chat-attachments bucket
CREATE POLICY "chat_storage_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'pixel-chat-attachments'
        AND split_part(name, '/', 1) = 'chat'
        AND public.pixel_chat_is_member(split_part(name, '/', 2))
    );

-- Allow uploading attachments to pixel-chat-attachments bucket
CREATE POLICY "chat_storage_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'pixel-chat-attachments'
        AND split_part(name, '/', 1) = 'chat'
        AND public.pixel_chat_is_member(split_part(name, '/', 2))
    );

-- ── 7. Enable Supabase Realtime ───────────────────────────────────

ALTER TABLE public.pixel_chat_messages     REPLICA IDENTITY FULL;
ALTER TABLE public.pixel_chat_typing       REPLICA IDENTITY FULL;
ALTER TABLE public.pixel_chat_room_members REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pixel_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pixel_chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pixel_chat_typing'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pixel_chat_typing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pixel_chat_room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pixel_chat_room_members;
  END IF;
END$$;

-- ── 8. Triggers for Auto updated_at Timestamps ─────────────────────

CREATE OR REPLACE FUNCTION public.pixel_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.pixel_chat_messages;
CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON public.pixel_chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.pixel_set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.pixel_chat_conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON public.pixel_chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.pixel_set_updated_at();
