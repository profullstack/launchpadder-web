-- Badge System Row Level Security Policies
-- This migration adds RLS policies for the badge system tables

-- Enable RLS on all badge system tables
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_earning_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_analytics ENABLE ROW LEVEL SECURITY;

-- Badge definitions policies
CREATE POLICY "Active badge definitions are viewable by everyone" ON public.badge_definitions
    FOR SELECT USING (is_active = TRUE AND is_public = TRUE);

CREATE POLICY "Admins can manage badge definitions" ON public.badge_definitions
    FOR ALL USING (public.is_moderator(auth.uid()));

-- User badges policies
CREATE POLICY "Public user badges are viewable by everyone" ON public.user_badges
    FOR SELECT USING (
        status = 'active' 
        AND is_visible = TRUE
    );

CREATE POLICY "Users can view their own badges" ON public.user_badges
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert user badges" ON public.user_badges
    FOR INSERT WITH CHECK (
        -- Only system functions or admins can award badges
        public.is_moderator(auth.uid()) OR 
        current_setting('role') = 'service_role'
    );

CREATE POLICY "Admins can update user badges" ON public.user_badges
    FOR UPDATE USING (public.is_moderator(auth.uid()));

CREATE POLICY "Users can update their badge display preferences" ON public.user_badges
    FOR UPDATE USING (
        auth.uid() = user_id 
        AND status = 'active'
    ) WITH CHECK (
        -- Users can only update display-related fields
        OLD.user_id = NEW.user_id
        AND OLD.badge_id = NEW.badge_id
        AND OLD.status = NEW.status
        AND OLD.assignment_type = NEW.assignment_type
        AND OLD.earned_at = NEW.earned_at
    );

-- Badge earning history policies
CREATE POLICY "Badge earning history is viewable by badge owner" ON public.badge_earning_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all badge earning history" ON public.badge_earning_history
    FOR SELECT USING (public.is_moderator(auth.uid()));

CREATE POLICY "System can insert badge earning history" ON public.badge_earning_history
    FOR INSERT WITH CHECK (
        public.is_moderator(auth.uid()) OR 
        current_setting('role') = 'service_role'
    );

-- Badge verifications policies
CREATE POLICY "Badge verifications are viewable by badge owner" ON public.badge_verifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_badges ub 
            WHERE ub.id = user_badge_id 
            AND ub.user_id = auth.uid()
        )
    );

CREATE POLICY "Public badge verifications are viewable by everyone" ON public.badge_verifications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_badges ub 
            JOIN public.badge_definitions bd ON ub.badge_id = bd.id
            WHERE ub.id = user_badge_id 
            AND ub.status = 'active'
            AND ub.is_visible = TRUE
            AND bd.is_public = TRUE
        )
    );

CREATE POLICY "System can manage badge verifications" ON public.badge_verifications
    FOR ALL USING (
        public.is_moderator(auth.uid()) OR 
        current_setting('role') = 'service_role'
    );

-- Badge analytics policies
CREATE POLICY "Badge analytics are viewable by admins" ON public.badge_analytics
    FOR SELECT USING (public.is_moderator(auth.uid()));

CREATE POLICY "System can manage badge analytics" ON public.badge_analytics
    FOR ALL USING (
        public.is_moderator(auth.uid()) OR 
        current_setting('role') = 'service_role'
    );

-- Create function to check if user can award badges
CREATE OR REPLACE FUNCTION public.can_award_badges(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is a moderator or admin
    RETURN public.is_moderator(user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get public badge leaderboard
CREATE OR REPLACE FUNCTION public.get_badge_leaderboard(
    badge_slug TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE(
    user_id UUID,
    username TEXT,
    full_name TEXT,
    avatar_url TEXT,
    badge_count BIGINT,
    latest_badge_earned_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        COUNT(ub.id) as badge_count,
        MAX(ub.earned_at) as latest_badge_earned_at
    FROM public.profiles p
    JOIN public.user_badges ub ON p.id = ub.user_id
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    WHERE 
        ub.status = 'active'
        AND ub.is_visible = TRUE
        AND bd.is_public = TRUE
        AND (badge_slug IS NULL OR bd.slug = badge_slug)
    GROUP BY p.id, p.username, p.full_name, p.avatar_url
    ORDER BY badge_count DESC, latest_badge_earned_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get badge statistics
CREATE OR REPLACE FUNCTION public.get_badge_stats(badge_slug TEXT)
RETURNS TABLE(
    total_awarded BIGINT,
    total_active BIGINT,
    unique_recipients BIGINT,
    avg_time_to_earn INTERVAL,
    recent_awards BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(ub.id) as total_awarded,
        COUNT(CASE WHEN ub.status = 'active' THEN 1 END) as total_active,
        COUNT(DISTINCT ub.user_id) as unique_recipients,
        AVG(ub.earned_at - p.created_at) as avg_time_to_earn,
        COUNT(CASE WHEN ub.earned_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent_awards
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    JOIN public.profiles p ON ub.user_id = p.id
    WHERE bd.slug = badge_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to automatically check and award badges
CREATE OR REPLACE FUNCTION public.auto_check_and_award_badges(p_user_id UUID)
RETURNS TABLE(awarded_badge_slug TEXT) AS $$
DECLARE
    badge_record RECORD;
    criteria_result JSONB;
    user_badge_id UUID;
BEGIN
    -- Loop through all active badges that can be automatically awarded
    FOR badge_record IN 
        SELECT * FROM public.badge_definitions 
        WHERE is_active = TRUE 
        AND criteria->>'automatic_award' = 'true'
        AND NOT EXISTS (
            SELECT 1 FROM public.user_badges 
            WHERE user_id = p_user_id 
            AND badge_id = badge_definitions.id 
            AND status = 'active'
        )
    LOOP
        -- Check if user meets criteria for this badge
        criteria_result := public.check_badge_criteria(p_user_id, badge_record.slug);
        
        -- If all criteria are met, award the badge
        IF (criteria_result->>'all_criteria_met')::BOOLEAN = TRUE THEN
            BEGIN
                user_badge_id := public.award_badge(
                    p_user_id,
                    badge_record.slug,
                    'automatic',
                    NULL,
                    'Automatically awarded based on criteria',
                    criteria_result
                );
                
                awarded_badge_slug := badge_record.slug;
                RETURN NEXT;
                
            EXCEPTION WHEN OTHERS THEN
                -- Log error but continue with other badges
                RAISE NOTICE 'Failed to award badge %: %', badge_record.slug, SQLERRM;
            END;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically check badges after certain events
CREATE OR REPLACE FUNCTION public.trigger_badge_check()
RETURNS TRIGGER AS $$
BEGIN
    -- Check badges for the user after submission, vote, or comment
    PERFORM public.auto_check_and_award_badges(
        CASE 
            WHEN TG_TABLE_NAME = 'submissions' THEN NEW.submitted_by
            WHEN TG_TABLE_NAME = 'votes' THEN NEW.user_id
            WHEN TG_TABLE_NAME = 'comments' THEN NEW.user_id
        END
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic badge checking
CREATE TRIGGER check_badges_after_submission
    AFTER INSERT ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_badge_check();

CREATE TRIGGER check_badges_after_vote
    AFTER INSERT ON public.votes
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_badge_check();

CREATE TRIGGER check_badges_after_comment
    AFTER INSERT ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_badge_check();

-- Update badge definitions to enable automatic awarding
UPDATE public.badge_definitions 
SET criteria = criteria || '{"automatic_award": true}'
WHERE slug IN (
    'active-community-member',
    'high-quality-submissions'
);