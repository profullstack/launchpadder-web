/**
 * Database Fixtures and Test Data Management
 * Provides consistent test data for integration tests
 */

import { testSupabase, testUtils } from '../setup.js';

/**
 * Database fixture manager for integration tests
 */
export class DatabaseFixtures {
  constructor() {
    this.createdRecords = {
      profiles: [],
      submissions: [],
      federation_instances: [],
      api_keys: [],
      votes: [],
      comments: []
    };
  }

  /**
   * Create a complete test user with profile
   */
  async createUser(overrides = {}) {
    const testId = testUtils.generateTestId();
    const userData = {
      email: `${testId}@test.com`,
      password: 'TestPassword123!',
      username: `user_${testId}`,
      full_name: `Test User ${testId}`,
      bio: `Bio for test user ${testId}`,
      website: `https://website-${testId}.com`,
      twitter_handle: `twitter_${testId}`,
      github_handle: `github_${testId}`,
      ...overrides
    };

    // Create auth user
    const { data: authUser, error: authError } = await testSupabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true,
      user_metadata: userData.metadata || {}
    });

    if (authError) throw new Error(`Failed to create auth user: ${authError.message}`);

    // Create profile
    const { data: profile, error: profileError } = await testSupabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        username: userData.username,
        full_name: userData.full_name,
        bio: userData.bio,
        website: userData.website,
        twitter_handle: userData.twitter_handle,
        github_handle: userData.github_handle
      })
      .select()
      .single();

    if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`);

    this.createdRecords.profiles.push(profile.id);

    return {
      auth: authUser.user,
      profile,
      credentials: { email: userData.email, password: userData.password }
    };
  }

  /**
   * Create test submission with all metadata
   */
  async createSubmission(userId, overrides = {}) {
    const testId = testUtils.generateTestId();
    const submissionData = {
      url: `https://product-${testId}.com`,
      original_meta: {
        title: `Original Product ${testId}`,
        description: `Original description for product ${testId}`,
        image: `https://product-${testId}.com/og-image.jpg`,
        favicon: `https://product-${testId}.com/favicon.ico`,
        author: `Author ${testId}`,
        keywords: ['product', 'test', testId],
        openGraph: {
          title: `OG Title ${testId}`,
          description: `OG description ${testId}`,
          image: `https://product-${testId}.com/og-image.jpg`,
          url: `https://product-${testId}.com`,
          type: 'website'
        },
        twitter: {
          card: 'summary_large_image',
          title: `Twitter Title ${testId}`,
          description: `Twitter description ${testId}`,
          image: `https://product-${testId}.com/twitter-image.jpg`
        }
      },
      rewritten_meta: {
        title: `🚀 Revolutionary Product ${testId} - Game Changer!`,
        description: `Discover the amazing ${testId} that will transform your workflow and boost productivity by 300%!`,
        image: `https://product-${testId}.com/og-image.jpg`,
        tags: ['revolutionary', 'productivity', 'game-changer', testId],
        category: 'productivity',
        pricing: 'freemium'
      },
      images: {
        logo: `https://storage.example.com/logos/product-${testId}.jpg`,
        banner: `https://storage.example.com/banners/product-${testId}.jpg`,
        screenshots: [
          `https://storage.example.com/screenshots/product-${testId}-1.jpg`,
          `https://storage.example.com/screenshots/product-${testId}-2.jpg`
        ],
        favicon: `https://storage.example.com/favicons/product-${testId}.ico`
      },
      submitted_by: userId,
      status: 'pending',
      tags: ['test', 'integration', testId],
      votes_count: 0,
      comments_count: 0,
      views_count: 0,
      ...overrides
    };

    const { data, error } = await testSupabase
      .from('submissions')
      .insert(submissionData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create submission: ${error.message}`);

    this.createdRecords.submissions.push(data.id);
    return data;
  }

  /**
   * Create federation instance
   */
  async createFederationInstance(overrides = {}) {
    const testId = testUtils.generateTestId();
    const instanceData = {
      name: `test_federation_${testId}`,
      url: `https://federation-${testId}.example.com`,
      description: `Test federation instance ${testId} for integration testing`,
      admin_email: `admin-${testId}@federation.com`,
      public_key: `-----BEGIN PUBLIC KEY-----\ntest_public_key_${testId}\n-----END PUBLIC KEY-----`,
      status: 'active',
      version: '1.0.0',
      total_submissions: 0,
      ...overrides
    };

    const { data, error } = await testSupabase
      .from('federation_instances')
      .insert(instanceData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create federation instance: ${error.message}`);

    this.createdRecords.federation_instances.push(data.id);
    return data;
  }

  /**
   * Create API key for user
   */
  async createApiKey(userId, overrides = {}) {
    const testId = testUtils.generateTestId();
    const keyData = {
      user_id: userId,
      name: `Test API Key ${testId}`,
      key_hash: `test_hash_${testId}_${Date.now()}`,
      permissions: ['read', 'write', 'submit'],
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
      ...overrides
    };

    const { data, error } = await testSupabase
      .from('api_keys')
      .insert(keyData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create API key: ${error.message}`);

    this.createdRecords.api_keys.push(data.id);
    return data;
  }

  /**
   * Create vote for submission
   */
  async createVote(submissionId, userId, voteType = 'up') {
    const voteData = {
      submission_id: submissionId,
      user_id: userId,
      vote_type: voteType
    };

    const { data, error } = await testSupabase
      .from('votes')
      .insert(voteData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create vote: ${error.message}`);

    this.createdRecords.votes.push(data.id);
    return data;
  }

  /**
   * Create comment for submission
   */
  async createComment(submissionId, userId, content, parentId = null) {
    const commentData = {
      submission_id: submissionId,
      user_id: userId,
      content,
      parent_id: parentId
    };

    const { data, error } = await testSupabase
      .from('comments')
      .insert(commentData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create comment: ${error.message}`);

    this.createdRecords.comments.push(data.id);
    return data;
  }

  /**
   * Create federated submission tracking
   */
  async createFederatedSubmission(localSubmissionId, remoteInstanceId, overrides = {}) {
    const testId = testUtils.generateTestId();
    const federatedData = {
      local_submission_id: localSubmissionId,
      remote_instance_id: remoteInstanceId,
      remote_submission_id: `remote_${testId}`,
      sync_status: 'pending',
      ...overrides
    };

    const { data, error } = await testSupabase
      .from('federated_submissions')
      .insert(federatedData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create federated submission: ${error.message}`);

    return data;
  }

  /**
   * Create a complete test scenario with user, submission, and interactions
   */
  async createCompleteScenario(options = {}) {
    const {
      userCount = 1,
      submissionCount = 1,
      withVotes = true,
      withComments = true,
      withFederation = false
    } = options;

    const scenario = {
      users: [],
      submissions: [],
      votes: [],
      comments: [],
      federationInstances: [],
      federatedSubmissions: []
    };

    // Create users
    for (let i = 0; i < userCount; i++) {
      const user = await this.createUser({
        username: `scenario_user_${i}_${testUtils.generateTestId()}`,
        full_name: `Scenario User ${i}`
      });
      scenario.users.push(user);
    }

    // Create submissions
    for (let i = 0; i < submissionCount; i++) {
      const randomUser = scenario.users[Math.floor(Math.random() * scenario.users.length)];
      const submission = await this.createSubmission(randomUser.profile.id, {
        url: `https://scenario-product-${i}-${testUtils.generateTestId()}.com`,
        status: i % 2 === 0 ? 'approved' : 'pending'
      });
      scenario.submissions.push(submission);
    }

    // Create votes if requested
    if (withVotes) {
      for (const submission of scenario.submissions) {
        for (const user of scenario.users) {
          if (Math.random() > 0.5) { // 50% chance of voting
            const vote = await this.createVote(
              submission.id,
              user.profile.id,
              Math.random() > 0.2 ? 'up' : 'down' // 80% upvotes
            );
            scenario.votes.push(vote);
          }
        }
      }
    }

    // Create comments if requested
    if (withComments) {
      for (const submission of scenario.submissions) {
        for (const user of scenario.users) {
          if (Math.random() > 0.7) { // 30% chance of commenting
            const comment = await this.createComment(
              submission.id,
              user.profile.id,
              `Test comment from ${user.profile.username} on ${submission.original_meta.title}`
            );
            scenario.comments.push(comment);
          }
        }
      }
    }

    // Create federation if requested
    if (withFederation) {
      const federationInstance = await this.createFederationInstance();
      scenario.federationInstances.push(federationInstance);

      for (const submission of scenario.submissions) {
        if (submission.status === 'approved' && Math.random() > 0.5) {
          const federatedSubmission = await this.createFederatedSubmission(
            submission.id,
            federationInstance.id
          );
          scenario.federatedSubmissions.push(federatedSubmission);
        }
      }
    }

    return scenario;
  }

  /**
   * Clean up all created test data
   */
  async cleanup() {
    const tables = Object.keys(this.createdRecords);
    
    for (const table of tables) {
      const ids = this.createdRecords[table];
      if (ids.length > 0) {
        try {
          await testSupabase
            .from(table)
            .delete()
            .in('id', ids);
        } catch (error) {
          console.warn(`Warning: Failed to cleanup ${table}:`, error.message);
        }
      }
    }

    // Reset tracking
    this.createdRecords = {
      profiles: [],
      submissions: [],
      federation_instances: [],
      api_keys: [],
      votes: [],
      comments: []
    };
  }
}

/**
 * Predefined test data sets
 */
export const testDataSets = {
  // Basic user data
  basicUser: {
    email: 'basic@test.com',
    password: 'BasicPassword123!',
    username: 'basic_user',
    full_name: 'Basic Test User'
  },

  // Admin user data
  adminUser: {
    email: 'admin@test.com',
    password: 'AdminPassword123!',
    username: 'admin_user',
    full_name: 'Admin Test User',
    metadata: { role: 'admin' }
  },

  // Moderator user data
  moderatorUser: {
    email: 'moderator@test.com',
    password: 'ModeratorPassword123!',
    username: 'moderator_user',
    full_name: 'Moderator Test User',
    metadata: { role: 'moderator' }
  },

  // Sample submission data
  sampleSubmission: {
    url: 'https://sample-product.com',
    original_meta: {
      title: 'Sample Product',
      description: 'A sample product for testing',
      image: 'https://sample-product.com/image.jpg'
    },
    rewritten_meta: {
      title: '🚀 Amazing Sample Product - Must Try!',
      description: 'Discover this incredible sample product that will revolutionize your workflow!',
      tags: ['amazing', 'revolutionary', 'must-try']
    },
    status: 'approved',
    tags: ['sample', 'test']
  },

  // Federation instance data
  sampleFederationInstance: {
    name: 'sample_federation',
    url: 'https://sample-federation.com',
    description: 'Sample federation instance for testing',
    admin_email: 'admin@sample-federation.com',
    status: 'active'
  }
};

export default DatabaseFixtures;