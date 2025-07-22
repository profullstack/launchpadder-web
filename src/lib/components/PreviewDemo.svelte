<script>
  import ImageCarousel from './ImageCarousel.svelte';
  
  export let previewData = null;
  export let loading = false;
  export let error = null;
  
  let url = '';
  
  async function fetchPreview() {
    if (!url.trim()) return;
    
    loading = true;
    error = null;
    previewData = null;
    
    try {
      const response = await fetch('/api/submissions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch preview');
      }
      
      previewData = await response.json();
    } catch (err) {
      error = err.message;
      console.error('Preview fetch error:', err);
    } finally {
      loading = false;
    }
  }
  
  function handleSubmit(event) {
    event.preventDefault();
    fetchPreview();
  }
  
  function clearPreview() {
    previewData = null;
    error = null;
    url = '';
  }
</script>

<div class="preview-demo">
  <div class="demo-header">
    <h2>Enhanced Metadata Preview Demo</h2>
    <p>Enter a URL to see the enhanced metadata extraction with logos, screenshots, and image carousel.</p>
  </div>
  
  <form on:submit={handleSubmit} class="url-form">
    <div class="input-group">
      <input
        type="url"
        bind:value={url}
        placeholder="Enter a website URL (e.g., https://example.com)"
        required
        disabled={loading}
        class="url-input"
      />
      <button
        type="submit"
        disabled={loading || !url.trim()}
        class="fetch-button"
      >
        {loading ? 'Fetching...' : 'Preview'}
      </button>
    </div>
  </form>
  
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Extracting metadata and capturing screenshots...</p>
    </div>
  {/if}
  
  {#if error}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>Preview Failed</h3>
      <p>{error}</p>
      <button on:click={clearPreview} class="retry-button">Try Again</button>
    </div>
  {/if}
  
  {#if previewData}
    <div class="preview-results">
      <div class="results-header">
        <h3>Preview Results</h3>
        <button on:click={clearPreview} class="clear-button">Clear</button>
      </div>
      
      <!-- Basic Metadata -->
      <div class="metadata-section">
        <h4>Basic Information</h4>
        <div class="metadata-grid">
          <div class="metadata-item">
            <label>Title:</label>
            <span>{previewData.title}</span>
          </div>
          <div class="metadata-item">
            <label>Description:</label>
            <span>{previewData.description}</span>
          </div>
          <div class="metadata-item">
            <label>URL:</label>
            <span class="url-text">{previewData.url}</span>
          </div>
          <div class="metadata-item">
            <label>Fetch Method:</label>
            <span class="method-badge">{previewData.fetchMethod}</span>
          </div>
        </div>
      </div>
      
      <!-- Image Carousel -->
      {#if previewData.images?.carousel && previewData.images.carousel.length > 0}
        <div class="carousel-section">
          <h4>Images & Screenshots ({previewData.images.carousel.length})</h4>
          <ImageCarousel 
            images={previewData.images.carousel}
            autoPlay={true}
            autoPlayInterval={4000}
            showThumbnails={true}
            showIndicators={true}
          />
        </div>
      {:else}
        <div class="no-images-section">
          <h4>Images & Screenshots</h4>
          <p>No images or screenshots were found for this URL.</p>
        </div>
      {/if}
      
      <!-- Logos Summary -->
      {#if previewData.logos?.sources && previewData.logos.sources.length > 0}
        <div class="logos-section">
          <h4>Detected Logos ({previewData.logos.sources.length})</h4>
          <div class="logos-grid">
            {#each previewData.logos.sources as logo, index}
              <div class="logo-item">
                <img src={logo.url} alt={logo.alt || `Logo ${index + 1}`} class="logo-thumb" />
                <div class="logo-info">
                  <span class="logo-type">{logo.type}</span>
                  <span class="logo-size">{logo.width}×{logo.height}</span>
                  <span class="logo-priority">Priority: {logo.priority}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Navbar Links -->
      {#if previewData.navbarLinks && previewData.navbarLinks.length > 0}
        <div class="navbar-section">
          <h4>Navbar Links ({previewData.navbarLinks.length})</h4>
          <div class="navbar-links">
            {#each previewData.navbarLinks as link}
              <div class="navbar-link">
                <span class="link-text">"{link.text}"</span>
                <span class="link-url">{link.url}</span>
                <span class="link-position">({link.position.x}, {link.position.y})</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Screenshots Summary -->
      {#if previewData.screenshots && previewData.screenshots.length > 0}
        <div class="screenshots-section">
          <h4>Screenshots Captured ({previewData.screenshots.length})</h4>
          <div class="screenshots-list">
            {#each previewData.screenshots as screenshot}
              <div class="screenshot-item">
                <span class="screenshot-link">"{screenshot.linkText}"</span>
                <span class="screenshot-file">{screenshot.screenshotUrl}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Topic Tags -->
      {#if previewData.topicTags && previewData.topicTags.length > 0}
        <div class="tags-section">
          <h4>Generated Topic Tags ({previewData.topicTags.length})</h4>
          <div class="tags-container">
            {#each previewData.topicTags as tagData}
              <div class="tag-item" title="Source: {tagData.source} | Confidence: {Math.round(tagData.confidence * 100)}%">
                <span class="tag-text">{tagData.tag}</span>
                <span class="tag-confidence">{Math.round(tagData.confidence * 100)}%</span>
                <span class="tag-source">{tagData.source}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .preview-demo {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .demo-header {
    text-align: center;
    margin-bottom: 2rem;
  }
  
  .demo-header h2 {
    color: #1f2937;
    margin-bottom: 0.5rem;
  }
  
  .demo-header p {
    color: #6b7280;
  }
  
  .url-form {
    margin-bottom: 2rem;
  }
  
  .input-group {
    display: flex;
    gap: 0.5rem;
    max-width: 600px;
    margin: 0 auto;
  }
  
  .url-input {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 1rem;
  }
  
  .url-input:focus {
    outline: none;
    border-color: #3b82f6;
  }
  
  .fetch-button {
    padding: 0.75rem 1.5rem;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .fetch-button:hover:not(:disabled) {
    background-color: #2563eb;
  }
  
  .fetch-button:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
  }
  
  .loading-state {
    text-align: center;
    padding: 3rem;
  }
  
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #e5e7eb;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .error-state {
    text-align: center;
    padding: 2rem;
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    color: #dc2626;
  }
  
  .error-icon {
    font-size: 2rem;
    margin-bottom: 1rem;
  }
  
  .retry-button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background-color: #dc2626;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .preview-results {
    background-color: #f9fafb;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
  
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .clear-button {
    padding: 0.5rem 1rem;
    background-color: #6b7280;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .metadata-section,
  .carousel-section,
  .no-images-section,
  .logos-section,
  .navbar-section,
  .screenshots-section,
  .tags-section {
    margin-bottom: 2rem;
    background-color: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .metadata-section h4,
  .carousel-section h4,
  .no-images-section h4,
  .logos-section h4,
  .navbar-section h4,
  .screenshots-section h4,
  .tags-section h4 {
    margin-bottom: 1rem;
    color: #1f2937;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 0.5rem;
  }
  
  .metadata-grid {
    display: grid;
    gap: 1rem;
  }
  
  .metadata-item {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.5rem;
    align-items: start;
  }
  
  .metadata-item label {
    font-weight: 600;
    color: #374151;
  }
  
  .url-text {
    word-break: break-all;
    color: #3b82f6;
  }
  
  .method-badge {
    background-color: #dbeafe;
    color: #1e40af;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .logos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .logo-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background-color: #f3f4f6;
    border-radius: 0.5rem;
  }
  
  .logo-thumb {
    width: 3rem;
    height: 3rem;
    object-fit: contain;
    background-color: white;
    border-radius: 0.25rem;
  }
  
  .logo-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }
  
  .logo-type {
    font-weight: 600;
    color: #1f2937;
  }
  
  .logo-size,
  .logo-priority {
    color: #6b7280;
  }
  
  .navbar-links {
    display: grid;
    gap: 0.5rem;
  }
  
  .navbar-link {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 1rem;
    padding: 0.75rem;
    background-color: #f3f4f6;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  
  .link-text {
    font-weight: 600;
    color: #1f2937;
  }
  
  .link-url {
    color: #3b82f6;
    word-break: break-all;
  }
  
  .link-position {
    color: #6b7280;
    font-family: monospace;
  }
  
  .screenshots-list {
    display: grid;
    gap: 0.5rem;
  }
  
  .screenshot-item {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1rem;
    padding: 0.75rem;
    background-color: #f3f4f6;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  
  .screenshot-link {
    font-weight: 600;
    color: #1f2937;
  }
  
  .screenshot-file {
    color: #059669;
    font-family: monospace;
  }
  
  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  
  .tag-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    cursor: help;
    transition: all 0.2s;
  }
  
  .tag-item:hover {
    background-color: #e5e7eb;
    border-color: #9ca3af;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .tag-text {
    font-weight: 600;
    color: #1f2937;
  }
  
  .tag-confidence {
    background-color: #dbeafe;
    color: #1e40af;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .tag-source {
    color: #6b7280;
    font-size: 0.75rem;
    font-style: italic;
  }
</style>