-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected', 'federated');
CREATE TYPE federation_status AS ENUM ('active', 'inactive', 'blocked');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
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

-- Submissions table
CREATE TABLE public.submissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    url TEXT NOT NULL,
    original_meta JSONB NOT NULL DEFAULT '{}',
    rewritten_meta JSONB NOT NULL DEFAULT '{}',
    images JSONB NOT NULL DEFAULT '{}',
    status submission_status DEFAULT 'pending',
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    votes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    
    -- Federation tracking
    is_federated BOOLEAN DEFAULT FALSE,
    source_instance TEXT,
    federated_at TIMESTAMP WITH TIME ZONE,
    
    -- SEO and indexing
    slug TEXT UNIQUE,
    tags TEXT[] DEFAULT '{}',
    
    CONSTRAINT valid_url CHECK (url ~* '^https?://'),
    CONSTRAINT valid_slug CHECK (slug ~* '^[a-z0-9-]+$')
);

-- Federation instances table
CREATE TABLE public.federation_instances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL UNIQUE,
    description TEXT,
    admin_email TEXT,
    public_key TEXT,
    status federation_status DEFAULT 'active',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Instance metadata
    version TEXT,
    total_submissions INTEGER DEFAULT 0,
    
    CONSTRAINT valid_instance_url CHECK (url ~* '^https?://'),
    CONSTRAINT valid_email CHECK (admin_email ~* '^[^@]+@[^@]+\.[^@]+$')
);

-- Federated submissions tracking
CREATE TABLE public.federated_submissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    local_submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    remote_instance_id UUID REFERENCES public.federation_instances(id) ON DELETE CASCADE,
    remote_submission_id UUID NOT NULL,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    
    UNIQUE(local_submission_id, remote_instance_id)
);

-- Votes table
CREATE TABLE public.votes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    vote_type TEXT CHECK (vote_type IN ('up', 'down')) DEFAULT 'up',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(submission_id, user_id)
);

-- Comments table
CREATE TABLE public.comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT non_empty_content CHECK (LENGTH(TRIM(content)) > 0)
);

-- API keys table for federation
CREATE TABLE public.api_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    permissions TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for performance
CREATE INDEX idx_submissions_status ON public.submissions(status);
CREATE INDEX idx_submissions_created_at ON public.submissions(created_at DESC);
CREATE INDEX idx_submissions_published_at ON public.submissions(published_at DESC);
CREATE INDEX idx_submissions_votes_count ON public.submissions(votes_count DESC);
CREATE INDEX idx_submissions_submitted_by ON public.submissions(submitted_by);
CREATE INDEX idx_submissions_slug ON public.submissions(slug);
CREATE INDEX idx_submissions_tags ON public.submissions USING GIN(tags);
CREATE INDEX idx_submissions_is_federated ON public.submissions(is_federated);

CREATE INDEX idx_votes_submission_id ON public.votes(submission_id);
CREATE INDEX idx_votes_user_id ON public.votes(user_id);

CREATE INDEX idx_comments_submission_id ON public.comments(submission_id);
CREATE INDEX idx_comments_user_id ON public.comments(user_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);

CREATE INDEX idx_federation_instances_status ON public.federation_instances(status);
CREATE INDEX idx_federation_instances_url ON public.federation_instances(url);

CREATE INDEX idx_federated_submissions_local_id ON public.federated_submissions(local_submission_id);
CREATE INDEX idx_federated_submissions_remote_id ON public.federated_submissions(remote_instance_id);

-- Create functions for automatic slug generation
CREATE OR REPLACE FUNCTION generate_slug(title TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(title, '[^a-zA-Z0-9\s-]', '', 'g'),
                '\s+', '-', 'g'
            ),
            '-+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_federation_instances_updated_at
    BEFORE UPDATE ON public.federation_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically generate slug before insert
CREATE OR REPLACE FUNCTION auto_generate_slug()
RETURNS TRIGGER AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Extract title from rewritten_meta or original_meta
    base_slug := generate_slug(
        COALESCE(
            NEW.rewritten_meta->>'title',
            NEW.original_meta->>'title',
            'untitled'
        )
    );
    
    -- Ensure slug is unique
    final_slug := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.submissions WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    NEW.slug := final_slug;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_generate_submission_slug
    BEFORE INSERT ON public.submissions
    FOR EACH ROW
    WHEN (NEW.slug IS NULL)
    EXECUTE FUNCTION auto_generate_slug();

-- Function to update vote counts
CREATE OR REPLACE FUNCTION update_submission_votes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.submissions 
        SET votes_count = votes_count + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END
        WHERE id = NEW.submission_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.submissions 
        SET votes_count = votes_count - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END
        WHERE id = OLD.submission_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.submissions 
        SET votes_count = votes_count + 
            CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END -
            CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END
        WHERE id = NEW.submission_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_votes_count
    AFTER INSERT OR UPDATE OR DELETE ON public.votes
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_votes_count();

-- Function to update comment counts
CREATE OR REPLACE FUNCTION update_submission_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.submissions 
        SET comments_count = comments_count + 1
        WHERE id = NEW.submission_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.submissions 
        SET comments_count = comments_count - 1
        WHERE id = OLD.submission_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comments_count
    AFTER INSERT OR DELETE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_comments_count();