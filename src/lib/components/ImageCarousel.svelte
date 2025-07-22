<script>
  import { onMount } from 'svelte';
  
  export let images = [];
  export let autoPlay = false;
  export let autoPlayInterval = 3000;
  export let showThumbnails = true;
  export let showIndicators = true;
  export let className = '';
  
  let currentIndex = 0;
  let carouselContainer;
  let autoPlayTimer;
  let isPlaying = autoPlay;
  
  // Filter out invalid images
  $: validImages = images.filter(img => img && img.url);
  $: hasMultipleImages = validImages.length > 1;
  
  onMount(() => {
    if (autoPlay && hasMultipleImages) {
      startAutoPlay();
    }
    
    return () => {
      stopAutoPlay();
    };
  });
  
  function startAutoPlay() {
    if (!hasMultipleImages) return;
    
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
      nextImage();
    }, autoPlayInterval);
    isPlaying = true;
  }
  
  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    isPlaying = false;
  }
  
  function toggleAutoPlay() {
    if (isPlaying) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }
  
  function nextImage() {
    if (!hasMultipleImages) return;
    currentIndex = (currentIndex + 1) % validImages.length;
  }
  
  function prevImage() {
    if (!hasMultipleImages) return;
    currentIndex = currentIndex === 0 ? validImages.length - 1 : currentIndex - 1;
  }
  
  function goToImage(index) {
    if (index >= 0 && index < validImages.length) {
      currentIndex = index;
    }
  }
  
  function handleImageError(event) {
    console.warn('Failed to load image:', event.target.src);
    // You could implement fallback logic here
  }
  
  function getImageTypeIcon(type) {
    switch (type) {
      case 'logo': return '🏢';
      case 'screenshot': return '📸';
      case 'image': return '🖼️';
      case 'favicon': return '🔗';
      default: return '📷';
    }
  }
  
  function getImageTypeColor(type) {
    switch (type) {
      case 'logo': return 'bg-blue-100 text-blue-800';
      case 'screenshot': return 'bg-green-100 text-green-800';
      case 'image': return 'bg-purple-100 text-purple-800';
      case 'favicon': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
</script>

<div class="image-carousel {className}" bind:this={carouselContainer}>
  {#if validImages.length === 0}
    <div class="no-images">
      <div class="no-images-placeholder">
        <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-gray-500 mt-2">No images available</p>
      </div>
    </div>
  {:else}
    <!-- Main Image Display -->
    <div class="main-image-container">
      <div class="image-wrapper">
        <img
          src={validImages[currentIndex].url}
          alt={validImages[currentIndex].title || 'Image'}
          class="main-image"
          on:error={handleImageError}
        />
        
        <!-- Image Type Badge -->
        <div class="image-type-badge {getImageTypeColor(validImages[currentIndex].type)}">
          <span class="type-icon">{getImageTypeIcon(validImages[currentIndex].type)}</span>
          <span class="type-text">{validImages[currentIndex].type}</span>
        </div>
        
        <!-- Navigation Arrows (only show if multiple images) -->
        {#if hasMultipleImages}
          <button
            class="nav-arrow nav-arrow-left"
            on:click={prevImage}
            aria-label="Previous image"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <button
            class="nav-arrow nav-arrow-right"
            on:click={nextImage}
            aria-label="Next image"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        {/if}
      </div>
      
      <!-- Image Info -->
      <div class="image-info">
        <h3 class="image-title">{validImages[currentIndex].title}</h3>
        {#if validImages[currentIndex].description}
          <p class="image-description">{validImages[currentIndex].description}</p>
        {/if}
      </div>
    </div>
    
    <!-- Controls (only show if multiple images) -->
    {#if hasMultipleImages}
      <div class="carousel-controls">
        <!-- Indicators -->
        {#if showIndicators}
          <div class="indicators">
            {#each validImages as _, index}
              <button
                class="indicator {index === currentIndex ? 'active' : ''}"
                on:click={() => goToImage(index)}
                aria-label="Go to image {index + 1}"
              ></button>
            {/each}
          </div>
        {/if}
        
        <!-- Auto-play Control -->
        {#if autoPlay}
          <button
            class="autoplay-toggle"
            on:click={toggleAutoPlay}
            aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
          >
            {#if isPlaying}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6" />
              </svg>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            {/if}
          </button>
        {/if}
        
        <!-- Image Counter -->
        <div class="image-counter">
          {currentIndex + 1} / {validImages.length}
        </div>
      </div>
      
      <!-- Thumbnails -->
      {#if showThumbnails && validImages.length > 1}
        <div class="thumbnails">
          {#each validImages as image, index}
            <button
              class="thumbnail {index === currentIndex ? 'active' : ''}"
              on:click={() => goToImage(index)}
              aria-label="View {image.title || `image ${index + 1}`}"
            >
              <img
                src={image.url}
                alt={image.title || 'Thumbnail'}
                class="thumbnail-image"
                on:error={handleImageError}
              />
              <div class="thumbnail-overlay">
                <span class="thumbnail-type">{getImageTypeIcon(image.type)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .image-carousel {
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
    background-color: white;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }
  
  .no-images {
    padding: 2rem;
  }
  
  .no-images-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 0;
  }
  
  .main-image-container {
    position: relative;
  }
  
  .image-wrapper {
    position: relative;
    background-color: #f3f4f6;
    aspect-ratio: 16/9;
  }
  
  .main-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  
  .image-type-badge {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .type-icon {
    font-size: 0.875rem;
  }
  
  .type-text {
    text-transform: capitalize;
  }
  
  .nav-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    padding: 0.5rem;
    border-radius: 9999px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .nav-arrow:hover {
    background-color: rgba(0, 0, 0, 0.75);
  }
  
  .nav-arrow-left {
    left: 0.75rem;
  }
  
  .nav-arrow-right {
    right: 0.75rem;
  }
  
  .image-info {
    padding: 1rem;
    background-color: white;
  }
  
  .image-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.25rem;
  }
  
  .image-description {
    font-size: 0.875rem;
    color: #4b5563;
  }
  
  .carousel-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background-color: #f9fafb;
    border-top: 1px solid #e5e7eb;
  }
  
  .indicators {
    display: flex;
    gap: 0.5rem;
  }
  
  .indicator {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background-color: #d1d5db;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .indicator:hover {
    background-color: #9ca3af;
  }
  
  .indicator.active {
    background-color: #3b82f6;
  }
  
  .autoplay-toggle {
    padding: 0.5rem;
    color: #4b5563;
    background: none;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .autoplay-toggle:hover {
    color: #1f2937;
    background-color: #e5e7eb;
  }
  
  .image-counter {
    font-size: 0.875rem;
    color: #4b5563;
    font-weight: 500;
  }
  
  .thumbnails {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    background-color: #f9fafb;
    border-top: 1px solid #e5e7eb;
    overflow-x: auto;
  }
  
  .thumbnail {
    position: relative;
    flex-shrink: 0;
    width: 4rem;
    height: 4rem;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .thumbnail:hover {
    border-color: #d1d5db;
  }
  
  .thumbnail.active {
    border-color: #3b82f6;
  }
  
  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .thumbnail-overlay {
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .thumbnail:hover .thumbnail-overlay {
    background-color: rgba(0, 0, 0, 0.2);
  }
  
  .thumbnail-type {
    color: white;
    font-size: 0.75rem;
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .thumbnail:hover .thumbnail-type {
    opacity: 1;
  }
  
  .thumbnail.active .thumbnail-overlay {
    background-color: rgba(59, 130, 246, 0.2);
  }
  
  .thumbnail.active .thumbnail-type {
    opacity: 1;
  }
</style>