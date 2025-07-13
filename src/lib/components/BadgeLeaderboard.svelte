<!--
  Badge Leaderboard Component
  
  Displays a leaderboard of users with the most badges, recent badge earners,
  and popular badges. Used for community engagement and gamification.
-->

<script>
  import { onMount } from 'svelte';
  import Badge from './Badge.svelte';
  
  // Props
  export let badgeSlug = null;
  export let timeframe = 'all'; // 'all', 'week', 'month', 'year'
  export let limit = 10;
  export let showRecentEarners = true;
  export let showPopularBadges = true;

  // State
  let leaderboard = [];
  let recentEarners = [];
  let popularBadges = [];
  let loading = true;
  let error = null;

  // Functions
  async function fetchLeaderboardData() {
    try {
      loading = true;
      error = null;

      const params = new URLSearchParams({
        limit: limit.toString(),
        timeframe
      });

      if (badgeSlug) {
        params.append('badge', badgeSlug);
      }

      const response = await fetch(`/api/badges/leaderboard?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch leaderboard data');
      }

      if (result.success) {
        leaderboard = result.data.leaderboard || [];
        recentEarners = result.data.recentEarners || [];
        popularBadges = result.data.popularBadges || [];
      }
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function formatBadgeCount(count) {
    if (count === 1) return '1 badge';
    return `${count} badges`;
  }

  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  function getRankIcon(position) {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${position}`;
    }
  }

  // Reactive updates
  $: if (badgeSlug !== null || timeframe || limit) {
    fetchLeaderboardData();
  }

  onMount(() => {
    fetchLeaderboardData();
  });
</script>

<div class="badge-leaderboard space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Badge Leaderboard
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        {#if badgeSlug}
          Top earners of the "{badgeSlug}" badge
        {:else}
          Community members with the most badges
        {/if}
      </p>
    </div>

    <!-- Timeframe Filter -->
    <select 
      bind:value={timeframe}
      class="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
    >
      <option value="all">All Time</option>
      <option value="year">This Year</option>
      <option value="month">This Month</option>
      <option value="week">This Week</option>
    </select>
  </div>

  {#if loading}
    <!-- Loading State -->
    <div class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-2 text-gray-600 dark:text-gray-400">Loading leaderboard...</span>
    </div>

  {:else if error}
    <!-- Error State -->
    <div class="text-center py-12">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Failed to load leaderboard
      </h3>
      <p class="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
      <button
        on:click={fetchLeaderboardData}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Try Again
      </button>
    </div>

  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Leaderboard -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Top Badge Earners
            </h3>
          </div>

          {#if leaderboard.length === 0}
            <div class="text-center py-8">
              <div class="text-4xl mb-4">🏆</div>
              <p class="text-gray-600 dark:text-gray-400">
                No badge earners found for this timeframe.
              </p>
            </div>
          {:else}
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each leaderboard as user, index (user.user_id)}
                <div class="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <!-- Rank -->
                  <div class="flex-shrink-0 w-8 text-center">
                    <span class="text-lg font-bold text-gray-900 dark:text-white">
                      {getRankIcon(index + 1)}
                    </span>
                  </div>

                  <!-- Avatar -->
                  <div class="flex-shrink-0">
                    {#if user.avatar_url}
                      <img 
                        src={user.avatar_url} 
                        alt={user.username || user.full_name}
                        class="w-10 h-10 rounded-full object-cover"
                      />
                    {:else}
                      <div class="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                        <span class="text-gray-600 dark:text-gray-300 font-medium">
                          {(user.username || user.full_name || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    {/if}
                  </div>

                  <!-- User Info -->
                  <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-gray-900 dark:text-white truncate">
                      {user.full_name || user.username || 'Anonymous User'}
                    </h4>
                    {#if user.username && user.full_name}
                      <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
                        @{user.username}
                      </p>
                    {/if}
                  </div>

                  <!-- Badge Count -->
                  <div class="flex-shrink-0 text-right">
                    <div class="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {user.badge_count}
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      {formatBadgeCount(user.badge_count)}
                    </div>
                    {#if user.latest_badge_earned_at}
                      <div class="text-xs text-gray-500 dark:text-gray-500">
                        Latest: {formatTimeAgo(user.latest_badge_earned_at)}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Recent Badge Earners -->
        {#if showRecentEarners && recentEarners.length > 0}
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-md font-semibold text-gray-900 dark:text-white">
                Recent Earners
              </h3>
            </div>
            <div class="p-4 space-y-3">
              {#each recentEarners.slice(0, 5) as earner (earner.user_id + earner.badge_definitions.slug)}
                <div class="flex items-center gap-3">
                  <Badge 
                    badge={earner.badge_definitions}
                    size="small"
                    showTooltip={true}
                    showVerification={false}
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {earner.profiles.username || earner.profiles.full_name}
                    </p>
                    <p class="text-xs text-gray-600 dark:text-gray-400">
                      {formatTimeAgo(earner.earned_at)}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Popular Badges -->
        {#if showPopularBadges && popularBadges.length > 0}
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-md font-semibold text-gray-900 dark:text-white">
                Popular Badges
              </h3>
            </div>
            <div class="p-4 space-y-3">
              {#each popularBadges.slice(0, 5) as badge (badge.slug)}
                <div class="flex items-center gap-3">
                  <Badge 
                    {badge}
                    size="small"
                    showTooltip={true}
                    showVerification={false}
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {badge.name}
                    </p>
                    <p class="text-xs text-gray-600 dark:text-gray-400">
                      {badge.count} earners
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .badge-leaderboard {
    width: 100%;
  }

  /* Dark mode select styling */
  .badge-leaderboard select {
    background-color: white;
    color: rgb(17 24 39);
  }

  :global(.dark) .badge-leaderboard select {
    background-color: rgb(31 41 55);
    border-color: rgb(75 85 99);
    color: white;
  }
</style>