import { json } from '@sveltejs/kit';
import { AuthService } from '../../../../lib/services/auth-service.js';
import { supabase } from '../../../../lib/config/supabase.js';

const authService = new AuthService({ supabase });

/**
 * POST /api/auth/signup
 * Register a new user account
 */
export async function POST({ request }) {
  try {
    const { email, password, username, full_name } = await request.json();

    // Validate required fields
    if (!email || !password || !username) {
      return json(
        { error: 'Email, password, and username are required' },
        { status: 400 }
      );
    }

    // Check if username is available
    const isUsernameAvailable = await authService.isUsernameAvailable(username);
    console.log(`Username availability check for "${username}":`, isUsernameAvailable);
    
    if (!isUsernameAvailable) {
      return json(
        { error: 'Username is already taken' },
        { status: 400 }
      );
    }

    // Attempt to create account
    const result = await authService.signUp({
      email,
      password,
      username,
      full_name
    });

    return json({
      user: {
        id: result.user.id,
        email: result.user.email,
        email_confirmed_at: result.user.email_confirmed_at,
        profile: result.profile
      },
      session: result.session,
      message: 'Account created successfully. Please check your email to confirm your account.'
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    // Return appropriate error message
    if (error.message.includes('User already registered')) {
      return json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }
    
    if (error.message.includes('Username already taken')) {
      return json(
        { error: 'Username is already taken' },
        { status: 400 }
      );
    }
    
    if (error.message.includes('Invalid email format')) {
      return json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }
    
    if (error.message.includes('Password must be')) {
      return json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    if (error.message.includes('Username must be')) {
      return json(
        { error: error.message },
        { status: 400 }
      );
    }

    return json(
      { error: 'An error occurred during registration. Please try again.' },
      { status: 500 }
    );
  }
}