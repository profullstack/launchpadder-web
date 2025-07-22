-- Fix badge system references to use users table instead of profiles
-- and ensure all user_id references are consistent

-- Update the badge leaderboard function to use users table
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
        u.id,
        u.username,
        u.full_name,
        u.avatar_url,
        COUNT(ub.id) as badge_count,
        MAX(ub.earned_at) as latest_badge_earned_at
    FROM public.users u
    JOIN public.user_badges ub ON u.id = ub.user_id
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    WHERE 
        ub.status = 'active'
        AND ub.is_visible = TRUE
        AND bd.is_public = TRUE
        AND (badge_slug IS NULL OR bd.slug = badge_slug)
    GROUP BY u.id, u.username, u.full_name, u.avatar_url
    ORDER BY badge_count DESC, latest_badge_earned_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the badge stats function to use users table
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
        AVG(ub.earned_at - u.created_at) as avg_time_to_earn,
        COUNT(CASE WHEN ub.earned_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent_awards
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    JOIN public.users u ON ub.user_id = u.id
    WHERE bd.slug = badge_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to document the fix
COMMENT ON FUNCTION public.get_badge_leaderboard(TEXT, INTEGER) IS 'Badge leaderboard function - updated to use users table instead of profiles';
COMMENT ON FUNCTION public.get_badge_stats(TEXT) IS 'Badge statistics function - updated to use users table instead of profiles';