<script>
  import { onMount } from 'svelte';
  
  let isOnline = true;
  
  onMount(() => {
    // Check initial online status
    isOnline = navigator.onLine;
    
    // Listen for online/offline events
    const handleOnline = () => {
      isOnline = true;
    };
    
    const handleOffline = () => {
      isOnline = false;
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });
  
  function retry() {
    if (navigator.onLine) {
      window.history.back();
    }
  }
</script>

<svelte:head>
  <title>Offline | LaunchPadder</title>
  <meta name="description" content="You're currently offline. LaunchPadder will work again when your connection is restored." />
</svelte:head>

<div class="offline-container">
  <div class="offline-content">
    <div class="offline-icon">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17.5 12c0 4.142-3.358 7.5-7.5 7.5s-7.5-3.358-7.5-7.5 3.358-7.5 7.5-7.5c1.381 0 2.67.373 3.784 1.024" />
        <path d="m22 2-3 3m0 0-3-3m3 3v8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </div>
    
    <h1>You're Offline</h1>
    
    <p class="offline-message">
      It looks like you've lost your internet connection. Don't worry - LaunchPadder will work again when your connection is restored.
    </p>
    
    <div class="connection-status">
      <div class="status-indicator" class:online={isOnline} class:offline={!isOnline}>
        <div class="status-dot"></div>
        <span>{isOnline ? 'Back Online' : 'Offline'}</span>
      </div>
    </div>
    
    <div class="offline-actions">
      <button class="retry-btn" on:click={retry} disabled={!isOnline}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        Try Again
      </button>
      
      <a href="/" class="home-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
        Go Home
      </a>
    </div>
    
    <div class="offline-features">
      <h2>What you can do offline:</h2>
      <ul>
        <li>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4" />
          </svg>
          Browse previously visited pages
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4" />
          </svg>
          View cached submissions and launches
        </li>
        <li>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4" />
          </svg>
          Prepare submissions (will sync when online)
        </li>
      </ul>
    </div>
  </div>
</div>

<style>
  .offline-container {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  }
  
  .offline-content {
    max-width: 500px;
    text-align: center;
    background: white;
    padding: 3rem 2rem;
    border-radius: 1rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  }
  
  .offline-icon {
    color: #64748b;
    margin-bottom: 2rem;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 1rem;
  }
  
  .offline-message {
    font-size: 1.125rem;
    color: #64748b;
    line-height: 1.6;
    margin-bottom: 2rem;
  }
  
  .connection-status {
    margin-bottom: 2rem;
  }
  
  .status-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-weight: 500;
    transition: all 0.3s ease;
  }
  
  .status-indicator.offline {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }
  
  .status-indicator.online {
    background: #f0fdf4;
    color: #16a34a;
    border: 1px solid #bbf7d0;
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: blink 1.5s infinite;
  }
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
  }
  
  .offline-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 3rem;
    flex-wrap: wrap;
  }
  
  .retry-btn,
  .home-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1rem;
  }
  
  .retry-btn {
    background: #2563eb;
    color: white;
  }
  
  .retry-btn:hover:not(:disabled) {
    background: #1d4ed8;
    transform: translateY(-1px);
  }
  
  .retry-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
    transform: none;
  }
  
  .home-btn {
    background: #f8fafc;
    color: #374151;
    border: 1px solid #d1d5db;
  }
  
  .home-btn:hover {
    background: #f1f5f9;
    border-color: #9ca3af;
    transform: translateY(-1px);
  }
  
  .offline-features {
    text-align: left;
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
  }
  
  .offline-features h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 1rem;
  }
  
  .offline-features ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .offline-features li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    color: #64748b;
  }
  
  .offline-features li svg {
    color: #16a34a;
    flex-shrink: 0;
  }
  
  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .offline-container {
      padding: 1rem;
      min-height: 70vh;
    }
    
    .offline-content {
      padding: 2rem 1.5rem;
    }
    
    h1 {
      font-size: 1.75rem;
    }
    
    .offline-message {
      font-size: 1rem;
    }
    
    .offline-actions {
      flex-direction: column;
      align-items: center;
    }
    
    .retry-btn,
    .home-btn {
      width: 100%;
      max-width: 200px;
      justify-content: center;
    }
  }
</style>