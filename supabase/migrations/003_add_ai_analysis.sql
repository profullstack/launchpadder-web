-- Add AI analysis column to submissions table
-- This will store the comprehensive AI analysis from the Enhanced AI Service

ALTER TABLE public.submissions 
ADD COLUMN ai_analysis JSONB DEFAULT NULL;

-- Add index for AI analysis queries
CREATE INDEX idx_submissions_ai_analysis ON public.submissions USING GIN(ai_analysis);

-- Add comment for documentation
COMMENT ON COLUMN public.submissions.ai_analysis IS 'Comprehensive AI analysis including content analysis, SEO optimization, sentiment analysis, and category detection';