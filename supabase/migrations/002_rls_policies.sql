-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.federation_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.federated_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Submissions policies
CREATE POLICY "Published submissions are viewable by everyone" ON public.submissions
    FOR SELECT USING (
        status IN ('approved', 'federated') 
        AND published_at IS NOT NULL
    );

CREATE POLICY "Users can view their own submissions" ON public.submissions
    FOR SELECT USING (auth.uid() = submitted_by);

CREATE POLICY "Authenticated users can insert submissions" ON public.submissions
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = submitted_by
    );

CREATE POLICY "Users can update their own pending submissions" ON public.submissions
    FOR UPDATE USING (
        auth.uid() = submitted_by 
        AND status = 'pending'
    );

CREATE POLICY "Users can delete their own pending submissions" ON public.submissions
    FOR DELETE USING (
        auth.uid() = submitted_by 
        AND status = 'pending'
    );

-- Federation instances policies (read-only for regular users)
CREATE POLICY "Federation instances are viewable by everyone" ON public.federation_instances
    FOR SELECT USING (status = 'active');

-- Federated submissions policies (system managed)
CREATE POLICY "Federated submissions are viewable by everyone" ON public.federated_submissions
    FOR SELECT USING (true);

-- Votes policies
CREATE POLICY "Votes are viewable by everyone" ON public.votes
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert votes" ON public.votes
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = user_id
    );

CREATE POLICY "Users can update their own votes" ON public.votes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON public.votes
    FOR DELETE USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Comments are viewable by everyone" ON public.comments
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert comments" ON public.comments
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = user_id
    );

CREATE POLICY "Users can update their own comments" ON public.comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- API keys policies
CREATE POLICY "Users can view their own API keys" ON public.api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON public.api_keys
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = user_id
    );

CREATE POLICY "Users can update their own API keys" ON public.api_keys
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON public.api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- Create a function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create a function to check if user can moderate submissions
CREATE OR REPLACE FUNCTION public.is_moderator(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- For now, we'll implement a simple check
    -- In the future, this could check for moderator role in profiles table
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_id 
        AND (
            -- Add moderator logic here
            -- For example: role = 'moderator' OR role = 'admin'
            false -- Placeholder - no moderators initially
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to approve submissions (for moderators)
CREATE OR REPLACE FUNCTION public.approve_submission(submission_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is a moderator
    IF NOT public.is_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;
    
    UPDATE public.submissions 
    SET 
        status = 'approved',
        published_at = NOW()
    WHERE id = submission_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to reject submissions (for moderators)
CREATE OR REPLACE FUNCTION public.reject_submission(submission_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is a moderator
    IF NOT public.is_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;
    
    UPDATE public.submissions 
    SET status = 'rejected'
    WHERE id = submission_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get submission statistics
CREATE OR REPLACE FUNCTION public.get_submission_stats(submission_id UUID)
RETURNS TABLE(
    votes_up INTEGER,
    votes_down INTEGER,
    total_votes INTEGER,
    comments_count INTEGER,
    views_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0)::INTEGER as votes_up,
        COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0)::INTEGER as votes_down,
        COALESCE(COUNT(v.id), 0)::INTEGER as total_votes,
        s.comments_count,
        s.views_count
    FROM public.submissions s
    LEFT JOIN public.votes v ON s.id = v.submission_id
    WHERE s.id = submission_id
    GROUP BY s.comments_count, s.views_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to increment view count
CREATE OR REPLACE FUNCTION public.increment_view_count(submission_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.submissions 
    SET views_count = views_count + 1
    WHERE id = submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get trending submissions
CREATE OR REPLACE FUNCTION public.get_trending_submissions(
    time_window INTERVAL DEFAULT '24 hours',
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
    id UUID,
    url TEXT,
    rewritten_meta JSONB,
    images JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    votes_count INTEGER,
    comments_count INTEGER,
    views_count INTEGER,
    submitted_by UUID,
    slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.url,
        s.rewritten_meta,
        s.images,
        s.created_at,
        s.votes_count,
        s.comments_count,
        s.views_count,
        s.submitted_by,
        s.slug
    FROM public.submissions s
    WHERE 
        s.status IN ('approved', 'federated')
        AND s.published_at IS NOT NULL
        AND s.created_at > NOW() - time_window
    ORDER BY 
        (s.votes_count * 0.5 + s.comments_count * 0.3 + s.views_count * 0.2) DESC,
        s.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;