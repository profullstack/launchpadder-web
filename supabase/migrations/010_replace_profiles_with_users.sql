-- Migration to replace profiles table with users table
-- This solves the RLS policy violation issue

-- First, drop all dependent objects
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop all policies on profiles table
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create users table with same structure as profiles
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    website TEXT,
    twitter_handle TEXT,
    github_handle TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Copy data from profiles to users if profiles table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        INSERT INTO public.users (id, username, full_name, avatar_url, bio, website, twitter_handle, github_handle, created_at, updated_at)
        SELECT id, username, full_name, avatar_url, bio, website, twitter_handle, github_handle, created_at, updated_at
        FROM public.profiles
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Update all foreign key references from profiles to users
-- Update submissions table
ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS submissions_submitted_by_fkey,
ADD CONSTRAINT submissions_submitted_by_fkey 
FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE CASCADE;

-- Update votes table
ALTER TABLE public.votes 
DROP CONSTRAINT IF EXISTS votes_user_id_fkey,
ADD CONSTRAINT votes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Update comments table
ALTER TABLE public.comments 
DROP CONSTRAINT IF EXISTS comments_user_id_fkey,
ADD CONSTRAINT comments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Update api_keys table
ALTER TABLE public.api_keys 
DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey,
ADD CONSTRAINT api_keys_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Drop the profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Public users are viewable by everyone" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own user record" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own user record" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Create updated trigger function for users table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update the is_moderator function to use users table
CREATE OR REPLACE FUNCTION public.is_moderator(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = user_id 
        AND (
            -- Add moderator logic here
            -- For example: role = 'moderator' OR role = 'admin'
            false -- Placeholder - no moderators initially
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;