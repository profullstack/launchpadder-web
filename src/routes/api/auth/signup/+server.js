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
    console.log('Signup endpoint called');
    const { email, password, username, full_name } = await request.json();
    console.log('Request data:', { email, username, full_name });

    // Validate required fields
    if (!email || !password || !username) {
      return json(
        { error: 'Email, password, and username are required' },
        { status: 400 }
      );
    }

    console.log('About to check username availability');

    // Check if username is available
    const isUsernameAvailable = await authService.isUsernameAvailable(username);
    console.log(`Username availability check for "${username}":`, isUsernameAvailable);
    
    if (!isUsernameAvailable) {
      console.log('Username not available, returning error');
      return json(
        { error: 'Username is already taken' },
        { status: 400 }
      );
    }

    console.log('Username available, attempting to create account');
    // Attempt to create account
    const result = await authService.signUp({
      email,
      password,
      username,
      full_name
    });
    
    console.log('Account creation result:', result ? 'success' : 'failed');

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
    console.error('Signup error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
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

    // Log the full error for debugging
    console.error('Unhandled signup error:', error);
    
    return json(
      { error: 'An error occurred during registration. Please try again.' },
      { status: 500 }
    );
  }
}