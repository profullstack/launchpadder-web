/**
 * Authentication Service
 * Handles user authentication, registration, and profile management using Supabase Auth
 */

export class AuthService {
  constructor(options = {}) {
    if (!options.supabase) {
      throw new Error('Supabase client is required');
    }
    
    this.supabase = options.supabase;
  }

  /**
   * Register a new user account
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email address
   * @param {string} userData.password - User password
   * @param {string} userData.username - Unique username
   * @param {string} [userData.full_name] - User's full name
   * @returns {Promise<Object>} Registration result with user and session
   */
  async signUp(userData) {
    const { email, password, username, full_name } = userData;

    // Validate input data
    this.validateEmail(email);
    this.validatePassword(password);
    this.validateUsername(username);

    try {
      // Create auth user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: full_name || null
          }
        }
      });

      if (authError) {
        throw new Error(authError.message);
      }

      // Create user profile
      if (authData.user) {
        try {
          const { data: profileData, error: profileError } = await this.supabase
            .from('profiles')
            .insert({
              user_id: authData.user.id,
              username,
              full_name: full_name || null,
              email
            })
            .select()
            .single();

          if (profileError) {
            // Handle duplicate username
            if (profileError.code === '23505' && profileError.message.includes('username')) {
              throw new Error('Username already taken');
            }
            throw new Error(`Profile creation failed: ${profileError.message}`);
          }

          return {
            user: authData.user,
            session: authData.session,
            profile: profileData
          };
        } catch (profileError) {
          // If profile creation fails, we should clean up the auth user
          // In a real implementation, you might want to handle this differently
          throw profileError;
        }
      }

      return authData;
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Sign in an existing user
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - User email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} Sign in result with user and session
   */
  async signIn(credentials) {
    const { email, password } = credentials;

    // Validate input
    this.validateEmail(email);

    if (!password) {
      throw new Error('Password is required');
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(error.message);
      }

      // Fetch user profile
      if (data.user) {
        const profile = await this.getUserProfile(data.user.id);
        return {
          user: data.user,
          session: data.session,
          profile
        };
      }

      return data;
    } catch (error) {
      throw new Error(`Sign in failed: ${error.message}`);
    }
  }

  /**
   * Sign out the current user
   * @returns {Promise<Object>} Sign out result
   */
  async signOut() {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  /**
   * Get the current authenticated user
   * @returns {Promise<Object|null>} Current user with profile or null
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();

      if (error || !user) {
        return null;
      }

      // Fetch user profile
      const profile = await this.getUserProfile(user.id);

      return {
        ...user,
        profile
      };
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get user profile by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User profile or null
   */
  async getUserProfile(userId) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} profileData - Profile data to update
   * @returns {Promise<Object>} Updated profile
   */
  async updateProfile(userId, profileData) {
    // Validate profile data
    if (profileData.username) {
      this.validateUsername(profileData.username);
    }

    if (profileData.full_name && profileData.full_name.length > 100) {
      throw new Error('Full name must be less than 100 characters');
    }

    if (profileData.bio && profileData.bio.length > 500) {
      throw new Error('Bio must be less than 500 characters');
    }

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update({
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        // Handle duplicate username
        if (error.code === '23505' && error.message.includes('username')) {
          throw new Error('Username already taken');
        }
        throw new Error(`Profile update failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw new Error(`Profile update failed: ${error.message}`);
    }
  }

  /**
   * Send password reset email
   * @param {string} email - User email address
   * @returns {Promise<Object>} Reset result
   */
  async sendPasswordResetEmail(email) {
    this.validateEmail(email);

    try {
      const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/auth/reset-password`
          : 'http://localhost:5173/auth/reset-password'
      });

      if (error) {
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      throw new Error(`Password reset failed: ${error.message}`);
    }
  }

  /**
   * Confirm email with verification token
   * @param {string} token - Verification token
   * @param {string} email - User email
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmEmail(token, email) {
    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(`Email confirmation failed: ${error.message}`);
    }
  }

  /**
   * Resend confirmation email
   * @param {string} email - User email address
   * @returns {Promise<Object>} Resend result
   */
  async resendConfirmationEmail(email) {
    this.validateEmail(email);

    try {
      const { data, error } = await this.supabase.auth.resend({
        type: 'signup',
        email
      });

      if (error) {
        throw new Error(error.message);
      }

      return { error: null };
    } catch (error) {
      throw new Error(`Resend confirmation failed: ${error.message}`);
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @throws {Error} If email is invalid
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    if (email.length > 254) {
      throw new Error('Email address is too long');
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @throws {Error} If password is invalid
   */
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password is required');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      throw new Error('Password is too long (max 128 characters)');
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      throw new Error('Password must contain at least one number');
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
      throw new Error('Password must contain at least one letter');
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }

    // Check for common weak patterns
    const commonPatterns = [
      /^password/i,
      /^123456/,
      /^qwerty/i,
      /^admin/i,
      /^letmein/i
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        throw new Error('Password is too common or weak');
      }
    }
  }

  /**
   * Validate username format and requirements
   * @param {string} username - Username to validate
   * @throws {Error} If username is invalid
   */
  validateUsername(username) {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required');
    }

    if (username.length < 3 || username.length > 30) {
      throw new Error('Username must be between 3 and 30 characters');
    }

    // Username can only contain letters, numbers, underscores, and hyphens
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    if (!usernameRegex.test(username)) {
      throw new Error('Username can only contain letters, numbers, underscores, and hyphens, and must start with a letter');
    }

    // Check for reserved usernames
    const reservedUsernames = [
      'admin', 'administrator', 'root', 'system', 'api', 'www', 'mail',
      'support', 'help', 'info', 'contact', 'about', 'privacy', 'terms',
      'login', 'signup', 'register', 'auth', 'oauth', 'user', 'users',
      'profile', 'account', 'settings', 'dashboard', 'home', 'index'
    ];

    if (reservedUsernames.includes(username.toLowerCase())) {
      throw new Error('Username is reserved and cannot be used');
    }
  }

  /**
   * Check if username is available
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} True if available, false if taken
   */
  async isUsernameAvailable(username) {
    try {
      this.validateUsername(username);

      const { data, error } = await this.supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single();

      // If no error and data exists, username is taken
      if (!error && data) {
        return false;
      }

      // If error is "No rows found", username is available
      if (error && error.code === 'PGRST116') {
        return true;
      }

      // For other errors, assume username is not available for safety
      return false;
    } catch (error) {
      // If validation fails, username is not available
      return false;
    }
  }

  /**
   * Get authentication state change listener
   * @param {Function} callback - Callback function for auth state changes
   * @returns {Object} Subscription object with unsubscribe method
   */
  onAuthStateChange(callback) {
    return this.supabase.auth.onAuthStateChange(async (event, session) => {
      let user = null;
      
      if (session?.user) {
        const profile = await this.getUserProfile(session.user.id);
        user = {
          ...session.user,
          profile
        };
      }

      callback(event, session, user);
    });
  }

  /**
   * Update user password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Update result
   */
  async updatePassword(newPassword) {
    this.validatePassword(newPassword);

    try {
      const { data, error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(`Password update failed: ${error.message}`);
    }
  }

  /**
   * Update user email
   * @param {string} newEmail - New email address
   * @returns {Promise<Object>} Update result
   */
  async updateEmail(newEmail) {
    this.validateEmail(newEmail);

    try {
      const { data, error } = await this.supabase.auth.updateUser({
        email: newEmail
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(`Email update failed: ${error.message}`);
    }
  }
}