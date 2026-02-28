-- CLEANUP (Optional: Uncomment if you want to wipe existing tables)
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS group_members CASCADE;
-- DROP TABLE IF EXISTS groups CASCADE;
-- DROP TABLE IF EXISTS conversation_participants CASCADE;
-- DROP TABLE IF EXISTS conversations CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  is_visible BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. CONVERSATIONS TABLE (For DMs)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. CONVERSATION PARTICIPANTS (For DMs)
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

-- 4. GROUPS TABLE
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_joinable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. GROUP MEMBERS
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- 6. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio')),
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  CONSTRAINT message_target CHECK (
    (conversation_id IS NOT NULL AND group_id IS NULL) OR
    (conversation_id IS NULL AND group_id IS NOT NULL)
  )
);

-- 7. RLS POLICIES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public users are viewable by everyone" ON users;
CREATE POLICY "Public users are viewable by everyone" ON users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversations viewable by participants" ON conversations;
CREATE POLICY "Conversations viewable by participants" ON conversations FOR SELECT 
  USING (EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations" ON conversations FOR INSERT WITH CHECK (true);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants viewable by members" ON conversation_participants;
CREATE POLICY "Participants viewable by members" ON conversation_participants FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = conversation_id AND cp2.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can join conversations" ON conversation_participants;
CREATE POLICY "Users can join conversations" ON conversation_participants FOR INSERT WITH CHECK (true);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Groups viewable by members" ON groups;
CREATE POLICY "Groups viewable by members" ON groups FOR SELECT
  USING (EXISTS (SELECT 1 FROM group_members WHERE group_id = id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can create groups" ON groups;
CREATE POLICY "Users can create groups" ON groups FOR INSERT WITH CHECK (true);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members viewable by group members" ON group_members;
CREATE POLICY "Members viewable by group members" ON group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = group_id AND gm2.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
CREATE POLICY "Users can join groups" ON group_members FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can update members" ON group_members;
CREATE POLICY "Admins can update members" ON group_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = group_id AND gm2.user_id = auth.uid() AND gm2.role IN ('owner', 'admin')));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages viewable by participants" ON messages;
CREATE POLICY "Messages viewable by participants" ON messages FOR SELECT
  USING (
    (conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())) OR
    (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members WHERE group_id = messages.group_id AND user_id = auth.uid()))
  );
DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages" ON messages FOR INSERT
  WITH CHECK (
    (conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())) OR
    (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members WHERE group_id = messages.group_id AND user_id = auth.uid()))
  );
DROP POLICY IF EXISTS "Participants can update read status" ON messages;
CREATE POLICY "Participants can update read status" ON messages FOR UPDATE
  USING (
    (conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())) OR
    (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members WHERE group_id = messages.group_id AND user_id = auth.uid()))
  )
  WITH CHECK (
    (conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())) OR
    (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM group_members WHERE group_id = messages.group_id AND user_id = auth.uid()))
  );

-- 8. RPC FUNCTIONS
CREATE OR REPLACE FUNCTION get_common_conversation(user1 UUID, user2 UUID)
RETURNS SETOF conversations AS $$
BEGIN
  RETURN QUERY
  SELECT c.*
  FROM conversations c
  JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
  JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
  WHERE cp1.user_id = user1
    AND cp2.user_id = user2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. INDEXES
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
