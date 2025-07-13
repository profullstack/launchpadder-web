<!--
  Badge Component
  
  A reusable component for displaying individual badges with proper styling,
  tooltips, and verification indicators. Supports different sizes and styles.
-->

<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();

  // Props
  export let badge = null;
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let showTooltip = true;
  export let showVerification = true;
  export let clickable = false;
  export let earned_at = null;
  export let is_verified = false;

  // Reactive variables
  $: badgeSize = {
    small: 'w-6 h-6',
    medium: 'w-8 h-8', 
    large: 'w-12 h-12'
  }[size];

  $: textSize = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base'
  }[size];

  $: levelColors = {
    bronze: 'from-amber-600 to-amber-800',
    silver: 'from-gray-400 to-gray-600',
    gold: 'from-yellow-400 to-yellow-600',
    platinum: 'from-purple-400 to-purple-600',
    diamond: 'from-blue-400 to-blue-600'
  };

  $: categoryIcons = {
    verification: '✓',
    trust: '🛡️',
    quality: '⭐',
    community: '👥',
    technical: '⚙️',
    achievement: '🏆',
    federation: '🌐'
  };

  // Functions
  function handleClick() {
    if (clickable) {
      dispatch('click', { badge });
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  }

  function getBadgeStyle(badge) {
    if (!badge) return '';
    
    const baseColor = badge.color_hex || '#6B7280';
    const level = badge.level || 'bronze';
    const gradient = levelColors[level] || levelColors.bronze;
    
    return `background: linear-gradient(135deg, ${baseColor}20, ${baseColor}40); border-color: ${baseColor};`;
  }
</script>

<!-- Badge Container -->
<div 
  class="badge-container relative inline-flex items-center justify-center rounded-full border-2 transition-all duration-200 {badgeSize} {clickable ? 'cursor-pointer hover:scale-110' : ''}"
  style={getBadgeStyle(badge)}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role={clickable ? 'button' : 'img'}
  tabindex={clickable ? 0 : -1}
  aria-label={badge?.name || 'Badge'}
>
  <!-- Badge Icon/Image -->
  {#if badge?.icon_url}
    <img 
      src={badge.icon_url} 
      alt={badge.name}
      class="w-full h-full object-cover rounded-full"
      loading="lazy"
    />
  {:else if badge?.category}
    <span class="text-lg" role="img" aria-label={badge.category}>
      {categoryIcons[badge.category] || '🏅'}
    </span>
  {:else}
    <span class="text-lg" role="img" aria-label="badge">🏅</span>
  {/if}

  <!-- Verification Indicator -->
  {#if showVerification && is_verified}
    <div 
      class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white"
      title="Verified Badge"
    >
      <span class="text-white text-xs">✓</span>
    </div>
  {/if}

  <!-- Level Indicator -->
  {#if badge?.level && badge.level !== 'bronze'}
    <div 
      class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-gradient-to-r {levelColors[badge.level]} border border-white"
      title="{badge.level} level"
    ></div>
  {/if}
</div>

<!-- Tooltip -->
{#if showTooltip && badge}
  <div class="badge-tooltip hidden group-hover:block absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2">
    <div class="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-lg max-w-xs">
      <div class="font-semibold">{badge.name}</div>
      <div class="text-gray-300 text-xs mt-1">{badge.description}</div>
      
      {#if badge.category}
        <div class="flex items-center gap-1 mt-2 text-xs">
          <span class="bg-gray-700 px-2 py-1 rounded">
            {categoryIcons[badge.category]} {badge.category}
          </span>
          {#if badge.level}
            <span class="bg-gradient-to-r {levelColors[badge.level]} text-white px-2 py-1 rounded">
              {badge.level}
            </span>
          {/if}
        </div>
      {/if}

      {#if earned_at}
        <div class="text-gray-400 text-xs mt-2">
          Earned: {formatDate(earned_at)}
        </div>
      {/if}

      {#if is_verified}
        <div class="flex items-center gap-1 text-green-400 text-xs mt-1">
          <span>✓</span> Verified
        </div>
      {/if}

      <!-- Tooltip Arrow -->
      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  </div>
{/if}

<style>
  .badge-container {
    position: relative;
  }

  .badge-container:hover .badge-tooltip {
    display: block;
  }

  .badge-tooltip {
    z-index: 1000;
  }

  /* Animation for badge hover */
  .badge-container:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  /* Focus styles for accessibility */
  .badge-container:focus {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .badge-tooltip {
      max-width: 200px;
      font-size: 0.75rem;
    }
  }
</style>