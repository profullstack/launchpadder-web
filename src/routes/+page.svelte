<script>
  import { onMount } from 'svelte';
  
  let recentLaunches = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const response = await fetch('/api/submissions?limit=6');
      if (response.ok) {
        const data = await response.json();
        recentLaunches = data.submissions || [];
      } else {
        throw new Error('Failed to fetch launches');
      }
    } catch (err) {
      error = err.message;
      console.error('Error fetching launches:', err);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>API-Driven Launch Platform - Federated Product Launches</title>
  <meta name="description" content="Discover and launch digital products on our open-source, federated platform. API-first, decentralized, and community-driven." />
</svelte:head>

<div class="home">
  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-content">
      <h1 class="hero-title">
        Launch Your Product on the
        <span class="gradient-text">Federated Web</span>
      </h1>
      <p class="hero-description">
        ADLP is an open-source, API-first platform for launching digital products. 
        Join our decentralized network where instances communicate peer-to-peer, 
        ensuring your launches reach the widest audience without central control.
      </p>
      <div class="hero-actions">
        <a href="/submit" class="btn btn-primary btn-large">
          Submit Your Product
        </a>
        <a href="/launches" class="btn btn-outline btn-large">
          Browse Launches
        </a>
      </div>
    </div>
    <div class="hero-visual">
      <div class="network-visualization">
        <div class="node node-center">ADLP</div>
        <div class="node node-1">Instance 1</div>
        <div class="node node-2">Instance 2</div>
        <div class="node node-3">Instance 3</div>
        <div class="connection connection-1"></div>
        <div class="connection connection-2"></div>
        <div class="connection connection-3"></div>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="features">
    <div class="section-header">
      <h2>Why Choose ADLP?</h2>
      <p>Built for the modern web with federation, AI, and developer-first principles</p>
    </div>
    
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">🌐</div>
        <h3>Federated Network</h3>
        <p>Your launches automatically distribute across connected instances, reaching audiences everywhere without central gatekeepers.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🤖</div>
        <h3>AI-Powered Content</h3>
        <p>Our AI rewrites your product descriptions for uniqueness and SEO optimization, preventing duplicate content penalties.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3>API-First Design</h3>
        <p>Everything is accessible via our REST API. Build integrations, automate submissions, and create custom experiences.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🔓</div>
        <h3>Open Source</h3>
        <p>Fully open source under MIT license. Run your own instance, contribute features, or fork for custom needs.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🚀</div>
        <h3>Simple Submission</h3>
        <p>Just provide a URL. We automatically fetch metadata, logos, and generate optimized descriptions for your product.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🔒</div>
        <h3>Privacy Focused</h3>
        <p>No tracking, no ads, no data mining. Your submissions and user data remain private and secure.</p>
      </div>
    </div>
  </section>

  <!-- Recent Launches Section -->
  <section class="recent-launches">
    <div class="section-header">
      <h2>Recent Launches</h2>
      <p>Discover the latest products launched on our platform</p>
    </div>
    
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading recent launches...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p>Unable to load recent launches. Please try again later.</p>
      </div>
    {:else if recentLaunches.length === 0}
      <div class="empty-state">
        <h3>No launches yet</h3>
        <p>Be the first to launch your product on ADLP!</p>
        <a href="/submit" class="btn btn-primary">Submit First Product</a>
      </div>
    {:else}
      <div class="launches-grid">
        {#each recentLaunches as launch}
          <div class="launch-card">
            <div class="launch-image">
              {#if launch.images?.logo}
                <img src={launch.images.logo} alt={launch.rewritten_meta?.title || launch.original_meta?.title} />
              {:else}
                <div class="placeholder-image">
                  {(launch.rewritten_meta?.title || launch.original_meta?.title || 'Product').charAt(0)}
                </div>
              {/if}
            </div>
            <div class="launch-content">
              <h3 class="launch-title">
                {launch.rewritten_meta?.title || launch.original_meta?.title || 'Untitled Product'}
              </h3>
              <p class="launch-description">
                {launch.rewritten_meta?.description || launch.original_meta?.description || 'No description available'}
              </p>
              <div class="launch-meta">
                <span class="launch-date">
                  {new Date(launch.created_at).toLocaleDateString()}
                </span>
                <a href={launch.url} target="_blank" rel="noopener noreferrer" class="launch-link">
                  Visit Product →
                </a>
              </div>
            </div>
          </div>
        {/each}
      </div>
      
      <div class="section-footer">
        <a href="/launches" class="btn btn-outline">View All Launches</a>
      </div>
    {/if}
  </section>

  <!-- CTA Section -->
  <section class="cta">
    <div class="cta-content">
      <h2>Ready to Launch?</h2>
      <p>Join thousands of makers launching their products on the federated web</p>
      <a href="/submit" class="btn btn-primary btn-large">Submit Your Product</a>
    </div>
  </section>
</div>

<style>
  .home {
    width: 100%;
  }

  /* Hero Section */
  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: center;
    min-height: 500px;
    margin-bottom: 6rem;
  }

  .hero-title {
    font-size: 3rem;
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 1.5rem;
    color: #1f2937;
  }

  .gradient-text {
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-description {
    font-size: 1.25rem;
    color: #6b7280;
    margin-bottom: 2rem;
    line-height: 1.6;
  }

  .hero-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .btn-large {
    padding: 0.875rem 2rem;
    font-size: 1.125rem;
  }

  /* Network Visualization */
  .hero-visual {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .network-visualization {
    position: relative;
    width: 300px;
    height: 300px;
  }

  .node {
    position: absolute;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
    animation: pulse 2s infinite;
  }

  .node-center {
    width: 80px;
    height: 80px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .node-1 {
    width: 60px;
    height: 60px;
    top: 20%;
    left: 20%;
    transform: translate(-50%, -50%);
  }

  .node-2 {
    width: 60px;
    height: 60px;
    top: 20%;
    right: 20%;
    transform: translate(50%, -50%);
  }

  .node-3 {
    width: 60px;
    height: 60px;
    bottom: 20%;
    left: 50%;
    transform: translate(-50%, 50%);
  }

  .connection {
    position: absolute;
    background: #d1d5db;
    height: 2px;
    animation: flow 3s infinite;
  }

  .connection-1 {
    top: 35%;
    left: 35%;
    width: 30%;
    transform: rotate(-45deg);
  }

  .connection-2 {
    top: 35%;
    right: 35%;
    width: 30%;
    transform: rotate(45deg);
  }

  .connection-3 {
    bottom: 35%;
    left: 50%;
    width: 30%;
    transform: translate(-50%, 0) rotate(90deg);
  }

  @keyframes pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.05); }
  }

  @keyframes flow {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }

  /* Sections */
  section {
    margin-bottom: 6rem;
  }

  .section-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .section-header h2 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .section-header p {
    font-size: 1.125rem;
    color: #6b7280;
  }

  /* Features Grid */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
  }

  .feature-card {
    background: white;
    padding: 2rem;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  }

  .feature-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .feature-card h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .feature-card p {
    color: #6b7280;
    line-height: 1.6;
  }

  /* Launches Grid */
  .launches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
  }

  .launch-card {
    background: white;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .launch-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  }

  .launch-image {
    height: 200px;
    background: #f9fafb;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .launch-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image {
    width: 80px;
    height: 80px;
    background: #e5e7eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    color: #6b7280;
  }

  .launch-content {
    padding: 1.5rem;
  }

  .launch-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }

  .launch-description {
    color: #6b7280;
    line-height: 1.5;
    margin-bottom: 1rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .launch-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .launch-date {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .launch-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .launch-link:hover {
    color: #1d4ed8;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 3rem;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e5e7eb;
    border-top: 3px solid #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  .section-footer {
    text-align: center;
    margin-top: 3rem;
  }

  /* CTA Section */
  .cta {
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    color: white;
    padding: 4rem 2rem;
    border-radius: 1rem;
    text-align: center;
  }

  .cta h2 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }

  .cta p {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    opacity: 0.9;
  }

  .cta .btn-primary {
    background: white;
    color: #2563eb;
  }

  .cta .btn-primary:hover {
    background: #f9fafb;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .hero {
      grid-template-columns: 1fr;
      gap: 2rem;
      text-align: center;
    }

    .hero-title {
      font-size: 2rem;
    }

    .hero-description {
      font-size: 1.125rem;
    }

    .hero-actions {
      justify-content: center;
    }

    .network-visualization {
      width: 250px;
      height: 250px;
    }

    .section-header h2 {
      font-size: 2rem;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .launches-grid {
      grid-template-columns: 1fr;
    }

    .cta {
      padding: 3rem 1rem;
    }

    .cta h2 {
      font-size: 2rem;
    }
  }
</style>