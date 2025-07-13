<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  let user = null;
  let loading = true;
  let overviewStats = null;
  let systemHealth = null;
  let error = null;
  let timeRange = '30d';

  // Check authentication and load dashboard data
  onMount(async () => {
    try {
      // Check if user is authenticated (simplified)
      const token = localStorage.getItem('supabase.auth.token');
      if (!token) {
        goto('/auth/login');
        return;
      }

      // Load dashboard overview
      await loadOverview();
      await loadSystemHealth();
      
    } catch (err) {
      console.error('Dashboard error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function loadOverview() {
    try {
      const token = localStorage.getItem('supabase.auth.token');
      const response = await fetch(`/api/dashboard/overview?time_range=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        overviewStats = data.overview;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Error loading overview:', err);
      error = err.message;
    }
  }

  async function loadSystemHealth() {
    try {
      const token = localStorage.getItem('supabase.auth.token');
      const response = await fetch('/api/dashboard/health', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        systemHealth = data.health;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Error loading system health:', err);
      // Don't set error for health check failures
    }
  }

  async function handleTimeRangeChange() {
    loading = true;
    await loadOverview();
    loading = false;
  }

  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }
</script>

<svelte:head>
  <title>Platform Dashboard - LaunchPadder</title>
</svelte:head>

<div class="dashboard-container">
  <header class="dashboard-header">
    <h1>Platform Dashboard</h1>
    <div class="time-range-selector">
      <label for="timeRange">Time Range:</label>
      <select id="timeRange" bind:value={timeRange} on:change={handleTimeRangeChange}>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
        <option value="1y">Last year</option>
      </select>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading dashboard...</p>
    </div>
  {:else if error}
    <div class="error">
      <h2>Error Loading Dashboard</h2>
      <p>{error}</p>
      <button on:click={() => window.location.reload()}>Retry</button>
    </div>
  {:else}
    <!-- Overview Stats -->
    {#if overviewStats}
      <section class="overview-stats">
        <div class="stat-card">
          <h3>Total Submissions</h3>
          <div class="stat-value">{formatNumber(overviewStats.total_submissions)}</div>
          <div class="stat-breakdown">
            <span class="pending">Pending: {overviewStats.pending_submissions}</span>
            <span class="approved">Approved: {overviewStats.approved_submissions}</span>
            <span class="rejected">Rejected: {overviewStats.rejected_submissions}</span>
          </div>
        </div>

        <div class="stat-card">
          <h3>Total Users</h3>
          <div class="stat-value">{formatNumber(overviewStats.total_users)}</div>
          <div class="stat-change">
            +{overviewStats.new_users_this_period} new this period
          </div>
        </div>

        <div class="stat-card">
          <h3>Total Revenue</h3>
          <div class="stat-value">{formatCurrency(overviewStats.total_revenue)}</div>
          <div class="stat-change">
            +{formatCurrency(overviewStats.revenue_this_period)} this period
          </div>
        </div>

        <div class="stat-card">
          <h3>Federation Network</h3>
          <div class="stat-value">{overviewStats.federation_instances}</div>
          <div class="stat-breakdown">
            <span class="active">Active: {overviewStats.active_federation_instances}</span>
          </div>
        </div>
      </section>
    {/if}

    <!-- System Health -->
    {#if systemHealth}
      <section class="system-health">
        <h2>System Health</h2>
        <div class="health-grid">
          <div class="health-item">
            <span class="health-label">Overall Status</span>
            <span class="health-status {systemHealth.status}">{systemHealth.status}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Uptime</span>
            <span class="health-value">{systemHealth.uptime}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Response Time</span>
            <span class="health-value">{systemHealth.response_time}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Error Rate</span>
            <span class="health-value">{systemHealth.error_rate}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Database</span>
            <span class="health-status {systemHealth.database_status}">{systemHealth.database_status}</span>
          </div>
          <div class="health-item">
            <span class="health-label">Payments</span>
            <span class="health-status {systemHealth.payment_systems?.stripe}">{systemHealth.payment_systems?.stripe}</span>
          </div>
        </div>
      </section>
    {/if}

    <!-- Quick Actions -->
    <section class="quick-actions">
      <h2>Quick Actions</h2>
      <div class="action-grid">
        <a href="/dashboard/analytics" class="action-card">
          <h3>📊 Analytics</h3>
          <p>View detailed analytics and reports</p>
        </a>
        <a href="/dashboard/submissions" class="action-card">
          <h3>📝 Submissions</h3>
          <p>Manage and moderate submissions</p>
        </a>
        <a href="/dashboard/users" class="action-card">
          <h3>👥 Users</h3>
          <p>User management and roles</p>
        </a>
        <a href="/dashboard/federation" class="action-card">
          <h3>🌐 Federation</h3>
          <p>Manage federation network</p>
        </a>
        <a href="/dashboard/settings" class="action-card">
          <h3>⚙️ Settings</h3>
          <p>Platform configuration</p>
        </a>
        <a href="/dashboard/audit-logs" class="action-card">
          <h3>📋 Audit Logs</h3>
          <p>View system audit trail</p>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .dashboard-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .dashboard-header h1 {
    margin: 0;
    color: #1f2937;
    font-size: 2rem;
    font-weight: 700;
  }

  .time-range-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .time-range-selector label {
    font-weight: 500;
    color: #6b7280;
  }

  .time-range-selector select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: #6b7280;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #e5e7eb;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error {
    text-align: center;
    padding: 2rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    color: #dc2626;
  }

  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
  }

  .stat-card h3 {
    margin: 0 0 0.5rem 0;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .stat-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }

  .stat-breakdown .pending { color: #f59e0b; }
  .stat-breakdown .approved { color: #10b981; }
  .stat-breakdown .rejected { color: #ef4444; }
  .stat-breakdown .active { color: #10b981; }

  .stat-change {
    font-size: 0.875rem;
    color: #10b981;
    font-weight: 500;
  }

  .system-health {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    margin-bottom: 2rem;
  }

  .system-health h2 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .health-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }

  .health-label {
    font-weight: 500;
    color: #6b7280;
  }

  .health-status.healthy {
    color: #10b981;
    font-weight: 600;
  }

  .health-status.unhealthy {
    color: #ef4444;
    font-weight: 600;
  }

  .health-value {
    font-weight: 600;
    color: #1f2937;
  }

  .quick-actions {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
  }

  .quick-actions h2 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .action-card {
    display: block;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
  }

  .action-card:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    transform: translateY(-1px);
  }

  .action-card h3 {
    margin: 0 0 0.5rem 0;
    color: #1f2937;
    font-size: 1rem;
    font-weight: 600;
  }

  .action-card p {
    margin: 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .dashboard-container {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .overview-stats {
      grid-template-columns: 1fr;
    }

    .health-grid {
      grid-template-columns: 1fr;
    }

    .action-grid {
      grid-template-columns: 1fr;
    }
  }
</style>