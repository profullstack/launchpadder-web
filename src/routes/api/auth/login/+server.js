import { json } from '@sveltejs/kit';
import { AuthService } from '../../../../lib/services/auth-service.js';
import { supabase } from '../../../../lib/config/supabase.js';

const authService = new AuthService({ supabase });

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
export async function POST({ request, cookies }) {
  try {
    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      return json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Attempt to sign in
    const result = await authService.signIn({ email, password });

    if (result.session) {
      // Set session cookies
      cookies.set('sb-access-token', result.session.access_token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: result.session.expires_in
      });

      cookies.set('sb-refresh-token', result.session.refresh_token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
    }

    return json({
      user: {
        id: result.user.id,
        email: result.user.email,
        email_confirmed_at: result.user.email_confirmed_at,
        profile: result.profile
      },
      session: result.session ? {
        access_token: result.session.access_token,
        expires_at: result.session.expires_at
      } : null
    });

  } catch (error) {
    console.error('Login error:', error);
    
    // Return appropriate error message
    if (error.message.includes('Invalid login credentials')) {
      return json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    if (error.message.includes('Email not confirmed')) {
      return json(
        { error: 'Please confirm your email address before signing in' },
        { status: 401 }
      );
    }
    
    if (error.message.includes('Invalid email format')) {
      return json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    return json(
      { error: 'An error occurred during sign in. Please try again.' },
      { status: 500 }
    );
  }
}