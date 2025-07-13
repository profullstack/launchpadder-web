-- Badge System Migration
-- This migration creates the complete badge/recognition system for federation

-- Create custom types for badge system
CREATE TYPE badge_category AS ENUM (
    'verification',
    'trust',
    'quality',
    'community',
    'technical',
    'achievement',
    'federation'
);

CREATE TYPE badge_level AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
CREATE TYPE badge_assignment_type AS ENUM ('automatic', 'manual', 'verified');
CREATE TYPE badge_status AS ENUM ('active', 'revoked', 'suspended', 'pending');

-- Badge definitions table - defines all available badges
CREATE TABLE public.badge_definitions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category badge_category NOT NULL,
    level badge_level DEFAULT 'bronze',
    
    -- Visual assets and metadata
    icon_url TEXT,
    color_hex TEXT DEFAULT '#6B7280',
    background_gradient JSONB DEFAULT '{}',
    visual_metadata JSONB DEFAULT '{}',
    
    -- Earning criteria and requirements
    criteria JSONB NOT NULL DEFAULT '{}',
    requirements JSONB NOT NULL DEFAULT '{}',
    max_awards INTEGER, -- NULL means unlimited
    
    -- Federation and verification
    is_federation_badge BOOLEAN DEFAULT FALSE,
    requires_verification BOOLEAN DEFAULT FALSE,
    verification_criteria JSONB DEFAULT '{}',
    
    -- Progression and levels
    progression_rules JSONB DEFAULT '{}',
    next_level_badge_id UUID REFERENCES public.badge_definitions(id),
    
    -- System flags
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_color_hex CHECK (color_hex ~* '^#[0-9A-F]{6}$'),
    CONSTRAINT valid_slug CHECK (slug ~* '^[a-z0-9-]+$')
);

-- User badge assignments - tracks which users have which badges
CREATE TABLE public.user_badges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    badge_id UUID REFERENCES public.badge_definitions(id) ON DELETE CASCADE NOT NULL,
    
    -- Assignment details
    assignment_type badge_assignment_type DEFAULT 'automatic',
    status badge_status DEFAULT 'active',
    
    -- Verification and signatures
    verification_signature TEXT,
    verification_data JSONB DEFAULT '{}',
    verified_by UUID REFERENCES public.profiles(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Assignment context
    assigned_by UUID REFERENCES public.profiles(id),
    assignment_reason TEXT,
    assignment_context JSONB DEFAULT '{}',
    
    -- Revocation handling
    revoked_by UUID REFERENCES public.profiles(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    
    -- Display preferences
    is_visible BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    -- Timestamps
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, badge_id)
);

-- Badge earning history - detailed log of badge earning events
CREATE TABLE public.badge_earning_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_badge_id UUID REFERENCES public.user_badges(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    badge_id UUID REFERENCES public.badge_definitions(id) ON DELETE CASCADE NOT NULL,
    
    -- Event details
    event_type TEXT NOT NULL, -- 'earned', 'revoked', 'verified', 'updated'
    event_data JSONB DEFAULT '{}',
    trigger_source TEXT, -- 'submission', 'vote', 'comment', 'federation', 'manual'
    trigger_id UUID, -- ID of the triggering entity
    
    -- Context and metadata
    criteria_met JSONB DEFAULT '{}',
    calculation_data JSONB DEFAULT '{}',
    system_metadata JSONB DEFAULT '{}',
    
    -- Actor information
    actor_id UUID REFERENCES public.profiles(id),
    actor_type TEXT DEFAULT 'system', -- 'system', 'admin', 'moderator'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badge verification records - for cryptographic verification
CREATE TABLE public.badge_verifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_badge_id UUID REFERENCES public.user_badges(id) ON DELETE CASCADE NOT NULL,
    
    -- Cryptographic verification
    signature_hash TEXT NOT NULL,
    public_key TEXT NOT NULL,
    verification_payload JSONB NOT NULL DEFAULT '{}',
    
    -- Cross-platform verification
    issuing_instance_id UUID REFERENCES public.federation_instances(id),
    external_verification_url TEXT,
    
    -- Verification metadata
    verification_method TEXT DEFAULT 'ed25519', -- 'ed25519', 'rsa', 'ecdsa'
    verification_version TEXT DEFAULT '1.0',
    
    -- Status and validity
    is_valid BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badge analytics - aggregated statistics and insights
CREATE TABLE public.badge_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    badge_id UUID REFERENCES public.badge_definitions(id) ON DELETE CASCADE NOT NULL,
    
    -- Time period for analytics
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    period_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
    
    -- Badge statistics
    total_awarded INTEGER DEFAULT 0,
    total_active INTEGER DEFAULT 0,
    total_revoked INTEGER DEFAULT 0,
    unique_recipients INTEGER DEFAULT 0,
    
    -- Earning patterns
    automatic_awards INTEGER DEFAULT 0,
    manual_awards INTEGER DEFAULT 0,
    verified_awards INTEGER DEFAULT 0,
    
    -- Engagement metrics
    avg_time_to_earn INTERVAL,
    median_time_to_earn INTERVAL,
    fastest_earn_time INTERVAL,
    
    -- Federation metrics
    federation_awards INTEGER DEFAULT 0,
    cross_instance_verifications INTEGER DEFAULT 0,
    
    -- Calculated at
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(badge_id, period_start, period_end, period_type)
);

-- Create indexes for performance
CREATE INDEX idx_badge_definitions_category ON public.badge_definitions(category);
CREATE INDEX idx_badge_definitions_level ON public.badge_definitions(level);
CREATE INDEX idx_badge_definitions_active ON public.badge_definitions(is_active);
CREATE INDEX idx_badge_definitions_federation ON public.badge_definitions(is_federation_badge);
CREATE INDEX idx_badge_definitions_slug ON public.badge_definitions(slug);

CREATE INDEX idx_user_badges_user_id ON public.user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON public.user_badges(badge_id);
CREATE INDEX idx_user_badges_status ON public.user_badges(status);
CREATE INDEX idx_user_badges_assignment_type ON public.user_badges(assignment_type);
CREATE INDEX idx_user_badges_earned_at ON public.user_badges(earned_at DESC);
CREATE INDEX idx_user_badges_visible ON public.user_badges(is_visible);

CREATE INDEX idx_badge_earning_history_user_id ON public.badge_earning_history(user_id);
CREATE INDEX idx_badge_earning_history_badge_id ON public.badge_earning_history(badge_id);
CREATE INDEX idx_badge_earning_history_event_type ON public.badge_earning_history(event_type);
CREATE INDEX idx_badge_earning_history_trigger_source ON public.badge_earning_history(trigger_source);
CREATE INDEX idx_badge_earning_history_created_at ON public.badge_earning_history(created_at DESC);

CREATE INDEX idx_badge_verifications_user_badge_id ON public.badge_verifications(user_badge_id);
CREATE INDEX idx_badge_verifications_signature_hash ON public.badge_verifications(signature_hash);
CREATE INDEX idx_badge_verifications_valid ON public.badge_verifications(is_valid);
CREATE INDEX idx_badge_verifications_expires_at ON public.badge_verifications(expires_at);

CREATE INDEX idx_badge_analytics_badge_id ON public.badge_analytics(badge_id);
CREATE INDEX idx_badge_analytics_period ON public.badge_analytics(period_start, period_end);
CREATE INDEX idx_badge_analytics_period_type ON public.badge_analytics(period_type);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_badge_definitions_updated_at
    BEFORE UPDATE ON public.badge_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_badges_updated_at
    BEFORE UPDATE ON public.user_badges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_badge_verifications_updated_at
    BEFORE UPDATE ON public.badge_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to award a badge to a user
CREATE OR REPLACE FUNCTION public.award_badge(
    p_user_id UUID,
    p_badge_slug TEXT,
    p_assignment_type badge_assignment_type DEFAULT 'automatic',
    p_assigned_by UUID DEFAULT NULL,
    p_assignment_reason TEXT DEFAULT NULL,
    p_assignment_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_badge_id UUID;
    v_user_badge_id UUID;
    v_max_awards INTEGER;
    v_current_awards INTEGER;
BEGIN
    -- Get badge definition
    SELECT id, max_awards INTO v_badge_id, v_max_awards
    FROM public.badge_definitions
    WHERE slug = p_badge_slug AND is_active = TRUE;
    
    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'Badge not found or inactive: %', p_badge_slug;
    END IF;
    
    -- Check if user already has this badge
    IF EXISTS (
        SELECT 1 FROM public.user_badges 
        WHERE user_id = p_user_id AND badge_id = v_badge_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'User already has this badge';
    END IF;
    
    -- Check max awards limit
    IF v_max_awards IS NOT NULL THEN
        SELECT COUNT(*) INTO v_current_awards
        FROM public.user_badges
        WHERE badge_id = v_badge_id AND status = 'active';
        
        IF v_current_awards >= v_max_awards THEN
            RAISE EXCEPTION 'Badge award limit reached';
        END IF;
    END IF;
    
    -- Award the badge
    INSERT INTO public.user_badges (
        user_id, badge_id, assignment_type, assigned_by, 
        assignment_reason, assignment_context
    ) VALUES (
        p_user_id, v_badge_id, p_assignment_type, p_assigned_by,
        p_assignment_reason, p_assignment_context
    ) RETURNING id INTO v_user_badge_id;
    
    -- Log the earning event
    INSERT INTO public.badge_earning_history (
        user_badge_id, user_id, badge_id, event_type, 
        event_data, actor_id, actor_type
    ) VALUES (
        v_user_badge_id, p_user_id, v_badge_id, 'earned',
        jsonb_build_object(
            'assignment_type', p_assignment_type,
            'reason', p_assignment_reason,
            'context', p_assignment_context
        ),
        p_assigned_by,
        CASE WHEN p_assigned_by IS NULL THEN 'system' ELSE 'admin' END
    );
    
    RETURN v_user_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke a badge from a user
CREATE OR REPLACE FUNCTION public.revoke_badge(
    p_user_id UUID,
    p_badge_slug TEXT,
    p_revoked_by UUID,
    p_revocation_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_badge_id UUID;
    v_badge_id UUID;
BEGIN
    -- Get the user badge
    SELECT ub.id, ub.badge_id INTO v_user_badge_id, v_badge_id
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    WHERE ub.user_id = p_user_id 
    AND bd.slug = p_badge_slug 
    AND ub.status = 'active';
    
    IF v_user_badge_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Revoke the badge
    UPDATE public.user_badges
    SET 
        status = 'revoked',
        revoked_by = p_revoked_by,
        revoked_at = NOW(),
        revocation_reason = p_revocation_reason
    WHERE id = v_user_badge_id;
    
    -- Log the revocation event
    INSERT INTO public.badge_earning_history (
        user_badge_id, user_id, badge_id, event_type,
        event_data, actor_id, actor_type
    ) VALUES (
        v_user_badge_id, p_user_id, v_badge_id, 'revoked',
        jsonb_build_object(
            'reason', p_revocation_reason,
            'revoked_by', p_revoked_by
        ),
        p_revoked_by,
        'admin'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user badges with details
CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS TABLE(
    badge_id UUID,
    badge_slug TEXT,
    badge_name TEXT,
    badge_description TEXT,
    category badge_category,
    level badge_level,
    icon_url TEXT,
    color_hex TEXT,
    visual_metadata JSONB,
    earned_at TIMESTAMP WITH TIME ZONE,
    assignment_type badge_assignment_type,
    is_verified BOOLEAN,
    display_order INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bd.id,
        bd.slug,
        bd.name,
        bd.description,
        bd.category,
        bd.level,
        bd.icon_url,
        bd.color_hex,
        bd.visual_metadata,
        ub.earned_at,
        ub.assignment_type,
        (ub.verification_signature IS NOT NULL) as is_verified,
        ub.display_order
    FROM public.user_badges ub
    JOIN public.badge_definitions bd ON ub.badge_id = bd.id
    WHERE ub.user_id = p_user_id 
    AND ub.status = 'active'
    AND ub.is_visible = TRUE
    ORDER BY ub.display_order ASC, ub.earned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check badge earning criteria
CREATE OR REPLACE FUNCTION public.check_badge_criteria(
    p_user_id UUID,
    p_badge_slug TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_badge_record RECORD;
    v_user_stats RECORD;
    v_criteria_result JSONB := '{}';
    v_requirement JSONB;
    v_key TEXT;
    v_value JSONB;
    v_met BOOLEAN;
BEGIN
    -- Get badge definition
    SELECT * INTO v_badge_record
    FROM public.badge_definitions
    WHERE slug = p_badge_slug AND is_active = TRUE;
    
    IF v_badge_record IS NULL THEN
        RETURN jsonb_build_object('error', 'Badge not found');
    END IF;
    
    -- Get user statistics
    SELECT 
        COUNT(DISTINCT s.id) as submission_count,
        COUNT(DISTINCT v.id) as vote_count,
        COUNT(DISTINCT c.id) as comment_count,
        COALESCE(SUM(s.votes_count), 0) as total_votes_received,
        COALESCE(AVG(s.votes_count), 0) as avg_votes_per_submission,
        COUNT(DISTINCT CASE WHEN s.status = 'approved' THEN s.id END) as approved_submissions,
        COUNT(DISTINCT ub.id) as current_badges
    INTO v_user_stats
    FROM public.profiles p
    LEFT JOIN public.submissions s ON p.id = s.submitted_by
    LEFT JOIN public.votes v ON p.id = v.user_id
    LEFT JOIN public.comments c ON p.id = c.user_id
    LEFT JOIN public.user_badges ub ON p.id = ub.user_id AND ub.status = 'active'
    WHERE p.id = p_user_id;
    
    -- Check each requirement
    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_badge_record.requirements)
    LOOP
        v_met := FALSE;
        
        CASE v_key
            WHEN 'min_submissions' THEN
                v_met := v_user_stats.submission_count >= (v_value->>0)::INTEGER;
            WHEN 'min_votes_given' THEN
                v_met := v_user_stats.vote_count >= (v_value->>0)::INTEGER;
            WHEN 'min_comments' THEN
                v_met := v_user_stats.comment_count >= (v_value->>0)::INTEGER;
            WHEN 'min_votes_received' THEN
                v_met := v_user_stats.total_votes_received >= (v_value->>0)::INTEGER;
            WHEN 'min_approved_submissions' THEN
                v_met := v_user_stats.approved_submissions >= (v_value->>0)::INTEGER;
            WHEN 'min_avg_votes' THEN
                v_met := v_user_stats.avg_votes_per_submission >= (v_value->>0)::NUMERIC;
            ELSE
                v_met := FALSE;
        END CASE;
        
        v_criteria_result := v_criteria_result || jsonb_build_object(
            v_key, jsonb_build_object(
                'required', v_value,
                'current', CASE v_key
                    WHEN 'min_submissions' THEN to_jsonb(v_user_stats.submission_count)
                    WHEN 'min_votes_given' THEN to_jsonb(v_user_stats.vote_count)
                    WHEN 'min_comments' THEN to_jsonb(v_user_stats.comment_count)
                    WHEN 'min_votes_received' THEN to_jsonb(v_user_stats.total_votes_received)
                    WHEN 'min_approved_submissions' THEN to_jsonb(v_user_stats.approved_submissions)
                    WHEN 'min_avg_votes' THEN to_jsonb(v_user_stats.avg_votes_per_submission)
                    ELSE '0'::jsonb
                END,
                'met', to_jsonb(v_met)
            )
        );
    END LOOP;
    
    -- Add overall result
    v_criteria_result := v_criteria_result || jsonb_build_object(
        'all_criteria_met', 
        NOT EXISTS (
            SELECT 1 FROM jsonb_each(v_criteria_result) 
            WHERE value->'met' = 'false'::jsonb
        )
    );
    
    RETURN v_criteria_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert federation-specific badge definitions
INSERT INTO public.badge_definitions (
    slug, name, description, category, level, 
    icon_url, color_hex, is_federation_badge, requires_verification,
    criteria, requirements
) VALUES 
(
    'verified-federation-partner',
    'Verified Federation Partner',
    'Official verification as a trusted federation network partner',
    'federation',
    'gold',
    '/badges/verified-federation-partner.svg',
    '#10B981',
    TRUE,
    TRUE,
    '{"verification_required": true, "manual_approval": true}',
    '{"federation_instance": true, "admin_verification": true}'
),
(
    'trusted-network-member',
    'Trusted Network Member',
    'Recognized as a reliable and trustworthy member of the federation network',
    'trust',
    'silver',
    '/badges/trusted-network-member.svg',
    '#3B82F6',
    TRUE,
    FALSE,
    '{"min_federation_time": "30 days", "good_standing": true}',
    '{"min_submissions": 10, "min_votes_received": 50, "no_violations": true}'
),
(
    'high-quality-submissions',
    'High Quality Submissions',
    'Consistently submits high-quality content that receives positive engagement',
    'quality',
    'gold',
    '/badges/high-quality-submissions.svg',
    '#F59E0B',
    FALSE,
    FALSE,
    '{"avg_votes_threshold": 10, "min_submissions": 5}',
    '{"min_approved_submissions": 5, "min_avg_votes": 10}'
),
(
    'active-community-member',
    'Active Community Member',
    'Actively participates in the community through votes, comments, and submissions',
    'community',
    'bronze',
    '/badges/active-community-member.svg',
    '#8B5CF6',
    FALSE,
    FALSE,
    '{"engagement_score": 100}',
    '{"min_submissions": 3, "min_votes_given": 20, "min_comments": 10}'
),
(
    'api-integration-expert',
    'API Integration Expert',
    'Successfully integrated and actively uses the federation API',
    'technical',
    'silver',
    '/badges/api-integration-expert.svg',
    '#EF4444',
    TRUE,
    FALSE,
    '{"api_usage": true, "successful_integrations": 1}',
    '{"api_key_created": true, "successful_api_calls": 100}'
);