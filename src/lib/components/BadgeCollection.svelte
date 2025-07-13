<!--
  Badge Collection Component
  
  Displays a collection of badges in an organized layout with filtering,
  sorting, and showcase options. Used for user profiles and badge galleries.
-->

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Badge from './Badge.svelte';
  
  const dispatch = createEventDispatcher();

  // Props
  export let badges = [];
  export let userId = null;
  export let showFilters = true;
  export let showSort = true;
  export let maxDisplay = null;
  export let layout = 'grid'; // 'grid', 'list', 'compact'
  export let editable = false;
  export let loading = false;

  // State
  let filteredBadges = [];
  let selectedCategory = 'all';
  let selectedLevel = 'all';
  let sortBy = 'earned_at';
  let sortOrder = 'desc';
  let showAll = false;

  // Reactive variables
  $: categories = [...new Set(badges.map(b => b.category))].sort();
  $: levels = [...new Set(badges.map(b => b.level))].sort();
  $: displayedBadges = maxDisplay && !showAll ? 
    filteredBadges.slice(0, maxDisplay) : filteredBadges;
  $: hasMore = maxDisplay && filteredBadges.length > maxDisplay;

  // Functions
  function filterAndSortBadges() {
    let result = [...badges];

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter(badge => badge.category === selectedCategory);
    }

    // Apply level filter
    if (selectedLevel !== 'all') {
      result = result.filter(badge => badge.level === selectedLevel);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'name':
          aVal = a.badge_name || a.name || '';
          bVal = b.badge_name || b.name || '';
          break;
        case 'category':
          aVal = a.category || '';
          bVal = b.category || '';
          break;
        case 'level':
          const levelOrder = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 };
          aVal = levelOrder[a.level] || 0;
          bVal = levelOrder[b.level] || 0;
          break;
        case 'earned_at':
        default:
          aVal = new Date(a.earned_at || 0);
          bVal = new Date(b.earned_at || 0);
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    filteredBadges = result;
  }

  function handleBadgeClick(event) {
    dispatch('badgeClick', event.detail);
  }

  function toggleShowAll() {
    showAll = !showAll;
  }

  function resetFilters() {
    selectedCategory = 'all';
    selectedLevel = 'all';
    sortBy = 'earned_at';
    sortOrder = 'desc';
  }

  // Reactive updates
  $: if (badges) {
    filterAndSortBadges();
  }

  onMount(() => {
    filterAndSortBadges();
  });
</script>

<div class="badge-collection">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
    <div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        Badges {#if badges.length > 0}({badges.length}){/if}
      </h3>
      {#if filteredBadges.length !== badges.length}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredBadges.length} of {badges.length} badges
        </p>
      {/if}
    </div>

    <!-- Controls -->
    {#if showFilters || showSort}
      <div class="flex flex-wrap gap-2">
        {#if showFilters}
          <!-- Category Filter -->
          <select 
            bind:value={selectedCategory}
            class="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            {#each categories as category}
              <option value={category}>{category}</option>
            {/each}
          </select>

          <!-- Level Filter -->
          <select 
            bind:value={selectedLevel}
            class="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Levels</option>
            {#each levels as level}
              <option value={level}>{level}</option>
            {/each}
          </select>
        {/if}

        {#if showSort}
          <!-- Sort Options -->
          <select 
            bind:value={sortBy}
            class="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="earned_at">Date Earned</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="level">Level</option>
          </select>

          <button
            on:click={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
            class="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
            title="Toggle sort order"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        {/if}

        <!-- Reset Filters -->
        {#if selectedCategory !== 'all' || selectedLevel !== 'all' || sortBy !== 'earned_at' || sortOrder !== 'desc'}
          <button
            on:click={resetFilters}
            class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Reset
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center items-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-2 text-gray-600">Loading badges...</span>
    </div>
  
  <!-- Empty State -->
  {:else if badges.length === 0}
    <div class="text-center py-8">
      <div class="text-4xl mb-4">🏅</div>
      <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No badges yet</h4>
      <p class="text-gray-600 dark:text-gray-400">
        Start participating in the community to earn your first badge!
      </p>
    </div>

  <!-- No Results -->
  {:else if filteredBadges.length === 0}
    <div class="text-center py-8">
      <div class="text-4xl mb-4">🔍</div>
      <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No badges match your filters</h4>
      <p class="text-gray-600 dark:text-gray-400">
        Try adjusting your filters to see more badges.
      </p>
      <button
        on:click={resetFilters}
        class="mt-2 text-blue-600 hover:text-blue-800 underline"
      >
        Clear all filters
      </button>
    </div>

  <!-- Badge Display -->
  {:else}
    <!-- Grid Layout -->
    {#if layout === 'grid'}
      <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
        {#each displayedBadges as badge (badge.badge_id || badge.id)}
          <div class="group relative">
            <Badge 
              {badge}
              size="medium"
              showTooltip={true}
              showVerification={true}
              clickable={true}
              earned_at={badge.earned_at}
              is_verified={badge.is_verified}
              on:click={handleBadgeClick}
            />
          </div>
        {/each}
      </div>

    <!-- List Layout -->
    {:else if layout === 'list'}
      <div class="space-y-3">
        {#each displayedBadges as badge (badge.badge_id || badge.id)}
          <div class="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
            <Badge 
              {badge}
              size="medium"
              showTooltip={false}
              showVerification={true}
              clickable={true}
              earned_at={badge.earned_at}
              is_verified={badge.is_verified}
              on:click={handleBadgeClick}
            />
            <div class="flex-1">
              <h4 class="font-medium text-gray-900 dark:text-white">
                {badge.badge_name || badge.name}
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {badge.description}
              </p>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {badge.category}
                </span>
                <span class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {badge.level}
                </span>
                {#if badge.earned_at}
                  <span class="text-xs text-gray-500">
                    Earned {new Date(badge.earned_at).toLocaleDateString()}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

    <!-- Compact Layout -->
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each displayedBadges as badge (badge.badge_id || badge.id)}
          <Badge 
            {badge}
            size="small"
            showTooltip={true}
            showVerification={true}
            clickable={true}
            earned_at={badge.earned_at}
            is_verified={badge.is_verified}
            on:click={handleBadgeClick}
          />
        {/each}
      </div>
    {/if}

    <!-- Show More Button -->
    {#if hasMore}
      <div class="text-center mt-6">
        <button
          on:click={toggleShowAll}
          class="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
        >
          {showAll ? 'Show Less' : `Show All (${filteredBadges.length - maxDisplay} more)`}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .badge-collection {
    width: 100%;
  }

  /* Dark mode adjustments */
  :global(.dark) .badge-collection select {
    background-color: rgb(31 41 55);
    border-color: rgb(75 85 99);
    color: white;
  }

  :global(.dark) .badge-collection button {
    border-color: rgb(75 85 99);
  }

  :global(.dark) .badge-collection button:hover {
    background-color: rgb(55 65 81);
  }
</style>