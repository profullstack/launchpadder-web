<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  
  let submission = null;
  let loading = true;
  let error = null;
  
  onMount(async () => {
    const submissionId = $page.url.searchParams.get('id');
    
    if (!submissionId) {
      goto('/submit');
      return;
    }
    
    try {
      const response = await fetch(`/api/submissions/${submissionId}`);
      
      if (response.ok) {
        submission = await response.json();
      } else {
        throw new Error('Failed to load submission details');
      }
    } catch (err) {
      error = err.message;
      console.error('Error loading submission:', err);
    } finally {
      loading = false;
    }
  });
  
  function shareOnTwitter() {
    const text = `Just submitted "${submission?.rewritten_meta?.title || submission?.original_meta?.title}" to ADLP! 🚀`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(submission?.url)}`;
    window.open(url, '_blank');
  }
  
  function shareOnLinkedIn() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(submission?.url)}`;
    window.open(url, '_blank');
  }
  
  function copyLink() {
    navigator.clipboard.writeText(submission?.url);
    // Could add a toast notification here
  }
</script>

<svelte:head>
  <title>Submission Successful | ADLP</title>
  <meta name="description" content="Your product has been successfully submitted to ADLP." />
</svelte:head>

<div class="success-page">
  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading submission details...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <div class="error-icon">❌</div>
      <h1>Unable to Load Submission</h1>
      <p>{error}</p>
      <div class="actions">
        <a href="/submit" class="btn btn-primary">Submit Another Product</a>
        <a href="/launches" class="btn btn-outline">Browse Launches</a>
      </div>
    </div>
  {:else if submission}
    <div class="success-content">
      <!-- Success Header -->
      <div class="success-header">
        <div class="success-icon">🎉</div>
        <h1>Submission Successful!</h1>
        <p>Your product has been submitted and is now under review.</p>
      </div>

      <!-- Submission Details -->
      <div class="submission-card">
        <div class="submission-preview">
          {#if submission.images?.main}
            <img 
              src={submission.images.main} 
              alt={submission.rewritten_meta?.title || submission.original_meta?.title}
              class="preview-image"
            />
          {:else}
            <div class="placeholder-image">
              {(submission.rewritten_meta?.title || submission.original_meta?.title || 'Product').charAt(0)}
            </div>
          {/if}
        </div>
        
        <div class="submission-details">
          <h2>{submission.rewritten_meta?.title || submission.original_meta?.title}</h2>
          <p class="description">
            {submission.rewritten_meta?.description || submission.original_meta?.description}
          </p>
          
          {#if submission.tags && submission.tags.length > 0}
            <div class="tags">
              {#each submission.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}
          
          <div class="submission-meta">
            <div class="meta-item">
              <strong>Submission ID:</strong> {submission.id}
            </div>
            <div class="meta-item">
              <strong>Status:</strong> 
              <span class="status status-{submission.status}">{submission.status}</span>
            </div>
            <div class="meta-item">
              <strong>Submitted:</strong> {new Date(submission.created_at).toLocaleString()}
            </div>
            {#if submission.submission_type === 'federated'}
              <div class="meta-item">
                <strong>Type:</strong> Federated Submission
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- What's Next -->
      <div class="next-steps">
        <h3>What happens next?</h3>
        <div class="steps-grid">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Review Process</h4>
              <p>Our team will review your submission within 24-48 hours to ensure it meets our quality guidelines.</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Publication</h4>
              <p>Once approved, your product will be published on ADLP and federated to partner directories.</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Promotion</h4>
              <p>Share your launch with your network to maximize visibility and engagement.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Share Section -->
      <div class="share-section">
        <h3>Share your submission</h3>
        <p>Let your network know about your upcoming launch!</p>
        
        <div class="share-buttons">
          <button on:click={shareOnTwitter} class="share-btn twitter">
            <span class="share-icon">🐦</span>
            Share on Twitter
          </button>
          
          <button on:click={shareOnLinkedIn} class="share-btn linkedin">
            <span class="share-icon">💼</span>
            Share on LinkedIn
          </button>
          
          <button on:click={copyLink} class="share-btn copy">
            <span class="share-icon">🔗</span>
            Copy Link
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <a href="/submit" class="btn btn-primary">Submit Another Product</a>
        <a href="/launches" class="btn btn-outline">Browse Other Launches</a>
        <a href="/" class="btn btn-outline">Back to Home</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .success-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  /* Loading & Error States */
  .loading-state,
  .error-state {
    text-align: center;
    padding: 4rem 2rem;
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

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .error-state h1 {
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .error-state p {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  /* Success Content */
  .success-content {
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  /* Success Header */
  .success-header {
    text-align: center;
  }

  .success-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .success-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .success-header p {
    font-size: 1.25rem;
    color: #6b7280;
  }

  /* Submission Card */
  .submission-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 2rem;
    display: flex;
    gap: 2rem;
    align-items: flex-start;
  }

  .submission-preview {
    flex-shrink: 0;
  }

  .preview-image {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 0.5rem;
  }

  .placeholder-image {
    width: 120px;
    height: 120px;
    background: #f3f4f6;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    color: #6b7280;
  }

  .submission-details {
    flex: 1;
  }

  .submission-details h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.75rem;
  }

  .description {
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 1rem;
  }

  .tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .tag {
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-weight: 500;
  }

  .submission-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .meta-item {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .meta-item strong {
    color: #374151;
  }

  .status {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .status-pending {
    background: #fef3c7;
    color: #92400e;
  }

  .status-approved {
    background: #d1fae5;
    color: #065f46;
  }

  .status-rejected {
    background: #fee2e2;
    color: #991b1b;
  }

  /* Next Steps */
  .next-steps h3 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
  }

  .step {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .step-number {
    width: 40px;
    height: 40px;
    background: #2563eb;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    flex-shrink: 0;
  }

  .step-content h4 {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .step-content p {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  /* Share Section */
  .share-section {
    background: #f9fafb;
    padding: 2rem;
    border-radius: 0.75rem;
    text-align: center;
  }

  .share-section h3 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .share-section p {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .share-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .share-btn {
    background: white;
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .share-btn:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .share-btn.twitter:hover {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
  }

  .share-btn.linkedin:hover {
    background: #eff6ff;
    border-color: #0066cc;
    color: #0066cc;
  }

  .share-btn.copy:hover {
    background: #f0fdf4;
    border-color: #16a34a;
    color: #15803d;
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-outline {
    background: transparent;
    color: #6b7280;
    border: 1px solid #d1d5db;
  }

  .btn-outline:hover {
    background: #f9fafb;
    color: #374151;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .success-page {
      padding: 1rem;
    }

    .success-header h1 {
      font-size: 2rem;
    }

    .submission-card {
      flex-direction: column;
      text-align: center;
    }

    .steps-grid {
      grid-template-columns: 1fr;
    }

    .share-buttons {
      flex-direction: column;
    }

    .actions {
      flex-direction: column;
    }
  }
</style>