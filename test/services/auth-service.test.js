import { expect } from 'chai';
import nock from 'nock';
import { AuthService } from '../../src/lib/services/auth-service.js';

describe('AuthService', () => {
  let authService;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    authService = new AuthService({ supabase: mockSupabase });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create an instance with Supabase client', () => {
      expect(authService).to.be.instanceOf(AuthService);
      expect(authService.supabase).to.equal(mockSupabase);
    });

    it('should throw error if no Supabase client provided', () => {
      expect(() => new AuthService()).to.throw('Supabase client is required');
    });
  });

  describe('signUp', () => {
    it('should create a new user account successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123!',
        username: 'testuser'
      };

      const result = await authService.signUp(userData);

      expect(result).to.have.property('user');
      expect(result).to.have.property('session', null); // Email confirmation required
      expect(result.user).to.have.property('email', 'test@example.com');
      expect(result.user).to.have.property('email_confirmed_at', null);
    });

    it('should reject invalid email addresses', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'securePassword123',
        username: 'testuser'
      };

      try {
        await authService.signUp(userData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });

    it('should reject weak passwords', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        username: 'testuser'
      };

      try {
        await authService.signUp(userData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Password must be at least 8 characters');
      }
    });

    it('should reject invalid usernames', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123!',
        username: 'a' // Too short
      };

      try {
        await authService.signUp(userData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Username must be between 3 and 30 characters');
      }
    });

    it('should handle duplicate email addresses', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'securePassword123',
        username: 'testuser'
      };

      // Mock Supabase to return duplicate email error
      mockSupabase.auth.signUp = async () => ({
        data: { user: null, session: null },
        error: { message: 'User already registered' }
      });

      try {
        await authService.signUp(userData);
        expect.fail('Should have thrown duplicate email error');
      } catch (error) {
        expect(error.message).to.include('User already registered');
      }
    });

    it('should handle duplicate usernames', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123',
        username: 'existinguser'
      };

      // Mock profile creation to fail with duplicate username
      mockSupabase.from = () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }
            })
          })
        })
      });

      try {
        await authService.signUp(userData);
        expect.fail('Should have thrown duplicate username error');
      } catch (error) {
        expect(error.message).to.include('Username already taken');
      }
    });
  });

  describe('signIn', () => {
    it('should sign in user with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'securePassword123'
      };

      const result = await authService.signIn(credentials);

      expect(result).to.have.property('user');
      expect(result).to.have.property('session');
      expect(result.user).to.have.property('email', 'test@example.com');
      expect(result.session).to.have.property('access_token');
    });

    it('should reject invalid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongPassword'
      };

      // Mock Supabase to return invalid credentials error
      mockSupabase.auth.signInWithPassword = async () => ({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' }
      });

      try {
        await authService.signIn(credentials);
        expect.fail('Should have thrown invalid credentials error');
      } catch (error) {
        expect(error.message).to.include('Invalid login credentials');
      }
    });

    it('should reject unconfirmed email addresses', async () => {
      const credentials = {
        email: 'unconfirmed@example.com',
        password: 'securePassword123'
      };

      // Mock Supabase to return email not confirmed error
      mockSupabase.auth.signInWithPassword = async () => ({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' }
      });

      try {
        await authService.signIn(credentials);
        expect.fail('Should have thrown email not confirmed error');
      } catch (error) {
        expect(error.message).to.include('Email not confirmed');
      }
    });

    it('should validate email format', async () => {
      const credentials = {
        email: 'invalid-email',
        password: 'securePassword123'
      };

      try {
        await authService.signIn(credentials);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });
  });

  describe('signOut', () => {
    it('should sign out user successfully', async () => {
      const result = await authService.signOut();

      expect(result).to.have.property('error', null);
    });

    it('should handle sign out errors gracefully', async () => {
      // Mock Supabase to return sign out error
      mockSupabase.auth.signOut = async () => ({
        error: { message: 'Sign out failed' }
      });

      try {
        await authService.signOut();
        expect.fail('Should have thrown sign out error');
      } catch (error) {
        expect(error.message).to.include('Sign out failed');
      }
    });
  });

  describe('getCurrentUser', () => {
    it('should return current authenticated user', async () => {
      const user = await authService.getCurrentUser();

      expect(user).to.have.property('id');
      expect(user).to.have.property('email');
      expect(user).to.have.property('profile');
    });

    it('should return null for unauthenticated users', async () => {
      // Mock Supabase to return no user
      mockSupabase.auth.getUser = async () => ({
        data: { user: null },
        error: null
      });

      const user = await authService.getCurrentUser();

      expect(user).to.be.null;
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      const userId = 'user-123';
      const profileData = {
        username: 'newusername',
        full_name: 'John Doe',
        bio: 'Software developer'
      };

      const result = await authService.updateProfile(userId, profileData);

      expect(result).to.have.property('user_id', userId);
      expect(result).to.have.property('username', 'newusername');
      expect(result).to.have.property('full_name', 'John Doe');
      expect(result).to.have.property('bio', 'Software developer');
    });

    it('should validate username uniqueness', async () => {
      const userId = 'user-123';
      const profileData = {
        username: 'existinguser'
      };

      // Mock profile update to fail with duplicate username
      mockSupabase.from = () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }
              })
            })
          })
        })
      });

      try {
        await authService.updateProfile(userId, profileData);
        expect.fail('Should have thrown duplicate username error');
      } catch (error) {
        expect(error.message).to.include('Username already taken');
      }
    });

    it('should validate profile data', async () => {
      const userId = 'user-123';
      const profileData = {
        username: 'a' // Too short
      };

      try {
        await authService.updateProfile(userId, profileData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Username must be between 3 and 30 characters');
      }
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      const email = 'test@example.com';

      const result = await authService.sendPasswordResetEmail(email);

      expect(result).to.have.property('error', null);
    });

    it('should validate email format', async () => {
      const email = 'invalid-email';

      try {
        await authService.sendPasswordResetEmail(email);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });
  });

  describe('confirmEmail', () => {
    it('should confirm email with valid token', async () => {
      const token = 'valid-confirmation-token';
      const email = 'test@example.com';

      const result = await authService.confirmEmail(token, email);

      expect(result).to.have.property('user');
      expect(result).to.have.property('session');
      expect(result.user).to.have.property('email_confirmed_at');
    });

    it('should reject invalid confirmation tokens', async () => {
      const token = 'invalid-token';
      const email = 'test@example.com';

      // Mock Supabase to return invalid token error
      mockSupabase.auth.verifyOtp = async () => ({
        data: { user: null, session: null },
        error: { message: 'Token has expired or is invalid' }
      });

      try {
        await authService.confirmEmail(token, email);
        expect.fail('Should have thrown invalid token error');
      } catch (error) {
        expect(error.message).to.include('Token has expired or is invalid');
      }
    });
  });

  describe('resendConfirmationEmail', () => {
    it('should resend confirmation email successfully', async () => {
      const email = 'test@example.com';

      const result = await authService.resendConfirmationEmail(email);

      expect(result).to.have.property('error', null);
    });

    it('should validate email format', async () => {
      const email = 'invalid-email';

      try {
        await authService.resendConfirmationEmail(email);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });
  });

  describe('validatePassword', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'SecurePass123!',
        'MyP@ssw0rd2024',
        'Complex!Password1'
      ];

      strongPasswords.forEach(password => {
        expect(() => authService.validatePassword(password)).to.not.throw();
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        '123',           // Too short
        'password',      // No numbers/symbols
        '12345678',      // Only numbers
        'PASSWORD',      // Only uppercase
        'password123'    // No symbols
      ];

      weakPasswords.forEach(password => {
        expect(() => authService.validatePassword(password)).to.throw();
      });
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      validEmails.forEach(email => {
        expect(() => authService.validateEmail(email)).to.not.throw();
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..name@example.com'
      ];

      invalidEmails.forEach(email => {
        expect(() => authService.validateEmail(email)).to.throw();
      });
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'john-doe',
        'developer2024'
      ];

      validUsernames.forEach(username => {
        expect(() => authService.validateUsername(username)).to.not.throw();
      });
    });

    it('should reject invalid usernames', () => {
      const invalidUsernames = [
        'ab',              // Too short
        'a'.repeat(31),    // Too long
        'user@name',       // Invalid characters
        '123user',         // Starts with number
        'user name'        // Contains space
      ];

      invalidUsernames.forEach(username => {
        expect(() => authService.validateUsername(username)).to.throw();
      });
    });
  });
});

// Mock helper function
function createMockSupabase() {
  return {
    auth: {
      signUp: async (credentials) => ({
        data: {
          user: {
            id: 'user-123',
            email: credentials.email,
            email_confirmed_at: null,
            created_at: new Date().toISOString()
          },
          session: null
        },
        error: null
      }),

      signInWithPassword: async (credentials) => ({
        data: {
          user: {
            id: 'user-123',
            email: credentials.email,
            email_confirmed_at: new Date().toISOString()
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_at: Date.now() + 3600000
          }
        },
        error: null
      }),

      signOut: async () => ({
        error: null
      }),

      getUser: async () => ({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: new Date().toISOString()
          }
        },
        error: null
      }),

      verifyOtp: async (params) => ({
        data: {
          user: {
            id: 'user-123',
            email: params.email,
            email_confirmed_at: new Date().toISOString()
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token'
          }
        },
        error: null
      }),

      resetPasswordForEmail: async () => ({
        data: {},
        error: null
      }),

      resend: async () => ({
        data: {},
        error: null
      })
    },

    from: (table) => ({
      insert: (data) => ({
        select: () => ({
          single: async () => ({
            data: {
              id: 'profile-123',
              user_id: 'user-123',
              ...data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            error: null
          })
        })
      }),

      update: (data) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: {
                id: 'profile-123',
                user_id: 'user-123',
                ...data,
                updated_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      }),

      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'profile-123',
              user_id: 'user-123',
              username: 'testuser',
              full_name: 'Test User',
              bio: null,
              avatar_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            error: null
          })
        })
      })
    })
  };
}