<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  // State
  let launches = [];
  let loading = true;
  let error = null;
  let totalPages = 1;
  let currentPage = 1;
  let searchQuery = '';
  let selectedTags = [];
  let sortBy = 'created_at';
  let sortOrder = 'desc';
  
  // Pagination
  const limit = 12;
  
  // Available filters
  const sortOptions = [
    { value: 'created_at', label: 'Latest' },
    { value: 'votes_count', label: 'Most Popular' },
    { value: 'views_count', label: 'Most Viewed' },
    { value: 'published_at', label: 'Recently Published' }
  ];
  
  const popularTags = [
    'productivity', 'development', 'design', 'business', 
    'education', 'entertainment', 'health', 'finance'
  ];
  
  onMount(() => {
    // Get initial filters from URL
    const urlParams = new URLSearchParams($page.url.search);
    searchQuery = urlParams.get('search') || '';
    selectedTags = urlParams.get('tags')?.split(',').filter(Boolean) || [];
    sortBy = urlParams.get('sort') || 'created_at';
    sortOrder = urlParams.get('order') || 'desc';
    currentPage = parseInt(urlParams.get('page')) || 1;
    
    fetchLaunches();
  });
  
  async function fetchLaunches() {
    loading = true;
    error = null;
    
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
        status: 'approved'
      });
      
      if (searchQuery) params.set('search', searchQuery);
      if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
      
      const response = await fetch(`/api/submissions?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        launches = data.submissions || [];
        totalPages = data.pagination?.totalPages || 1;
      } else {
        throw new Error('Failed to fetch launches');
      }
    } catch (err) {
      error = err.message;
      console.error('Error fetching launches:', err);
    } finally {
      loading = false;
    }
  }
  
  function updateURL() {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    if (sortBy !== 'created_at') params.set('sort', sortBy);
    if (sortOrder !== 'desc') params.set('order', sortOrder);
    if (currentPage !== 1) params.set('page', currentPage.toString());
    
    const newURL = params.toString() ? `?${params}` : '/launches';
    window.history.replaceState({}, '', newURL);
  }
  
  function handleSearch() {
    currentPage = 1;
    updateURL();
    fetchLaunches();
  }
  
  function handleSortChange() {
    currentPage = 1;
    updateURL();
    fetchLaunches();
  }
  
  function toggleTag(tag) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
    currentPage = 1;
    updateURL();
    fetchLaunches();
  }
  
  function goToPage(page) {
    currentPage = page;
    updateURL();
    fetchLaunches();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  function clearFilters() {
    searchQuery = '';
    selectedTags = [];
    sortBy = 'created_at';
    sortOrder = 'desc';
    currentPage = 1;
    updateURL();
    fetchLaunches();
  }
  
  // Reactive search with debounce
  let searchTimeout;
  $: if (searchQuery !== undefined) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (currentPage === 1) {
        updateURL();
        fetchLaunches();
      } else {
        handleSearch();
      }
    }, 500);
  }
</script>

<svelte:head>
  <title>Browse Launches | ADLP</title>
  <meta name="description" content="Discover the latest product launches on ADLP - the federated launch platform. Find innovative tools, apps, and services." />
</svelte:head>

<div class="launches-page">
  <!-- Header -->
  <section class="page-header">
    <div class="header-content">
      <h1>Product Launches</h1>
      <p>Discover innovative products launched on the federated web</p>
    </div>
  </section>

  <!-- Filters -->
  <section class="filters-section">
    <div class="filters-container">
      <!-- Search -->
      <div class="search-group">
        <div class="search-input-wrapper">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search products..."
            class="search-input"
          />
          <button on:click={handleSearch} class="search-btn">
            🔍
          </button>
        </div>
      </div>

      <!-- Sort -->
      <div class="sort-group">
        <label for="sort-select" class="filter-label">Sort by:</label>
        <select
          id="sort-select"
          bind:value={sortBy}
          on:change={handleSortChange}
          class="sort-select"
        >
          {#each sortOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <!-- Clear Filters -->
      {#if searchQuery || selectedTags.length > 0 || sortBy !== 'created_at'}
        <button on:click={clearFilters} class="clear-filters-btn">
          Clear Filters
        </button>
      {/if}
    </div>

    <!-- Tags -->
    <div class="tags-container">
      <span class="tags-label">Filter by category:</span>
      <div class="tags-list">
        {#each popularTags as tag}
          <button
            on:click={() => toggleTag(tag)}
            class="tag-btn"
            class:active={selectedTags.includes(tag)}
          >
            {tag}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Results -->
  <section class="results-section">
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading launches...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <h3>Unable to load launches</h3>
        <p>{error}</p>
        <button on:click={fetchLaunches} class="retry-btn">Try Again</button>
      </div>
    {:else if launches.length === 0}
      <div class="empty-state">
        <h3>No launches found</h3>
        <p>
          {#if searchQuery || selectedTags.length > 0}
            Try adjusting your search or filters.
          {:else}
            Be the first to launch your product!
          {/if}
        </p>
        {#if searchQuery || selectedTags.length > 0}
          <button on:click={clearFilters} class="btn btn-outline">Clear Filters</button>
        {:else}
          <a href="/submit" class="btn btn-primary">Submit Your Product</a>
        {/if}
      </div>
    {:else}
      <!-- Launches Grid -->
      <div class="launches-grid">
        {#each launches as launch}
          <article class="launch-card">
            <div class="launch-image">
              {#if launch.images?.main}
                <img 
                  src={launch.images.main} 
                  alt={launch.rewritten_meta?.title || launch.original_meta?.title}
                  loading="lazy"
                />
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
              
              {#if launch.tags && launch.tags.length > 0}
                <div class="launch-tags">
                  {#each launch.tags.slice(0, 3) as tag}
                    <span class="launch-tag">{tag}</span>
                  {/each}
                  {#if launch.tags.length > 3}
                    <span class="launch-tag-more">+{launch.tags.length - 3}</span>
                  {/if}
                </div>
              {/if}
              
              <div class="launch-meta">
                <div class="launch-stats">
                  <span class="stat">
                    👁️ {launch.views_count || 0}
                  </span>
                  <span class="stat">
                    ❤️ {launch.votes_count || 0}
                  </span>
                  <span class="stat">
                    💬 {launch.comments_count || 0}
                  </span>
                </div>
                
                <div class="launch-actions">
                  <span class="launch-date">
                    {new Date(launch.created_at).toLocaleDateString()}
                  </span>
                  <a 
                    href={launch.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    class="visit-btn"
                  >
                    Visit →
                  </a>
                </div>
              </div>
            </div>
          </article>
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="pagination">
          <button
            on:click={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            class="pagination-btn"
          >
            ← Previous
          </button>
          
          <div class="pagination-numbers">
            {#each Array(totalPages) as _, i}
              {#if i + 1 === 1 || i + 1 === totalPages || Math.abs(i + 1 - currentPage) <= 2}
                <button
                  on:click={() => goToPage(i + 1)}
                  class="pagination-number"
                  class:active={currentPage === i + 1}
                >
                  {i + 1}
                </button>
              {:else if Math.abs(i + 1 - currentPage) === 3}
                <span class="pagination-ellipsis">...</span>
              {/if}
            {/each}
          </div>
          
          <button
            on:click={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            class="pagination-btn"
          >
            Next →
          </button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .launches-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  /* Header */
  .page-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .header-content h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .header-content p {
    font-size: 1.25rem;
    color: #6b7280;
  }

  /* Filters */
  .filters-section {
    background: white;
    padding: 2rem;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
    margin-bottom: 2rem;
  }

  .filters-container {
    display: flex;
    gap: 2rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .search-group {
    flex: 1;
    min-width: 300px;
  }

  .search-input-wrapper {
    display: flex;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .search-input {
    flex: 1;
    padding: 0.75rem;
    border: none;
    outline: none;
    font-size: 1rem;
  }

  .search-btn {
    background: #f9fafb;
    border: none;
    padding: 0.75rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .search-btn:hover {
    background: #f3f4f6;
  }

  .sort-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-label {
    font-weight: 500;
    color: #374151;
  }

  .sort-select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    cursor: pointer;
  }

  .clear-filters-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .clear-filters-btn:hover {
    background: #dc2626;
  }

  /* Tags */
  .tags-container {
    border-top: 1px solid #e5e7eb;
    padding-top: 1.5rem;
  }

  .tags-label {
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.75rem;
    display: block;
  }

  .tags-list {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag-btn {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
    padding: 0.375rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tag-btn:hover {
    background: #e5e7eb;
  }

  .tag-btn.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  /* Results */
  .results-section {
    min-height: 400px;
  }

  .loading-state,
  .error-state,
  .empty-state {
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

  .error-state h3,
  .empty-state h3 {
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .error-state p,
  .empty-state p {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .retry-btn {
    background: #2563eb;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
  }

  /* Launches Grid */
  .launches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 2rem;
    margin-bottom: 3rem;
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
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
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
    margin-bottom: 0.75rem;
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

  .launch-tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .launch-tag {
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-weight: 500;
  }

  .launch-tag-more {
    background: #f3f4f6;
    color: #6b7280;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .launch-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .launch-stats {
    display: flex;
    gap: 1rem;
  }

  .stat {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .launch-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .launch-date {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .visit-btn {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.875rem;
    transition: color 0.2s;
  }

  .visit-btn:hover {
    color: #1d4ed8;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin-top: 3rem;
  }

  .pagination-btn {
    background: white;
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background: #f9fafb;
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-numbers {
    display: flex;
    gap: 0.25rem;
  }

  .pagination-number {
    background: white;
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-number:hover {
    background: #f9fafb;
  }

  .pagination-number.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .pagination-ellipsis {
    padding: 0.5rem 0.25rem;
    color: #9ca3af;
  }

  /* Buttons */
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
    .header-content h1 {
      font-size: 2rem;
    }

    .filters-container {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .search-group {
      min-width: auto;
    }

    .sort-group {
      justify-content: space-between;
    }

    .launches-grid {
      grid-template-columns: 1fr;
    }

    .launch-meta {
      flex-direction: column;
      align-items: flex-start;
    }

    .pagination {
      flex-wrap: wrap;
    }

    .pagination-numbers {
      order: -1;
      width: 100%;
      justify-content: center;
      margin-bottom: 1rem;
    }
  }
</style>