<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authService } from '$lib/services/auth-service.js';
  
  let user = null;
  let permissions = null;
  let loading = true;
  let queue = [];
  let stats = null;
  let selectedSubmissions = new Set();
  let currentPage = 1;
  let totalPages = 1;
  let filters = {
    status: 'pending_review',
    assignedOnly: false
  };
  
  // Review modal state
  let showReviewModal = false;
  let selectedSubmission = null;
  let reviewDecision = '';
  let reviewNotes = '';
  let escalationReason = '';
  let submitting = false;
  
  onMount(async () => {
    // Check authentication
    user = await authService.getCurrentUser();
    if (!user) {
      goto('/auth/login?redirect=/moderation');
      return;
    }
    
    // Check moderation permissions
    await checkPermissions();
    if (!permissions?.can_moderate) {
      goto('/');
      return;
    }
    
    // Load initial data
    await Promise.all([
      loadQueue(),
      loadStats()
    ]);
    
    loading = false;
  });
  
  async function checkPermissions() {
    try {
      const response = await fetch('/api/moderation/permissions');
      if (response.ok) {
        permissions = await response.json();
      }
    } catch (error) {
      console.error('Failed to check permissions:', error);
    }
  }
  
  async function loadQueue() {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        status: filters.status,
        assigned: filters.assignedOnly.toString()
      });
      
      const response = await fetch(`/api/moderation/queue?${params}`);
      if (response.ok) {
        const data = await response.json();
        queue = data.submissions || [];
        totalPages = Math.ceil((data.total || 0) / 10);
      }
    } catch (error) {
      console.error('Failed to load queue:', error);
    }
  }
  
  async function loadStats() {
    try {
      const response = await fetch('/api/moderation/stats');
      if (response.ok) {
        stats = await response.json();
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }
  
  async function openReviewModal(submission) {
    selectedSubmission = submission;
    reviewDecision = '';
    reviewNotes = '';
    escalationReason = '';
    showReviewModal = true;
    
    // Load detailed submission data
    try {
      const response = await fetch(`/api/moderation/review?submissionId=${submission.id}`);
      if (response.ok) {
        const data = await response.json();
        selectedSubmission = data.submission;
      }
    } catch (error) {
      console.error('Failed to load submission details:', error);
    }
  }
  
  async function submitReview() {
    if (!selectedSubmission || !reviewDecision) return;
    
    submitting = true;
    
    try {
      const payload = {
        submissionId: selectedSubmission.id,
        decision: reviewDecision,
        notes: reviewNotes
      };
      
      if (reviewDecision === 'escalated') {
        payload.escalationReason = escalationReason;
      }
      
      const response = await fetch('/api/moderation/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        showReviewModal = false;
        selectedSubmissions.clear();
        await loadQueue();
        await loadStats();
      } else {
        const error = await response.json();
        alert(`Review failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Review submission failed:', error);
      alert('Review failed. Please try again.');
    } finally {
      submitting = false;
    }
  }
  
  function toggleSelection(submissionId) {
    if (selectedSubmissions.has(submissionId)) {
      selectedSubmissions.delete(submissionId);
    } else {
      selectedSubmissions.add(submissionId);
    }
    selectedSubmissions = selectedSubmissions;
  }
  
  function selectAll() {
    if (selectedSubmissions.size === queue.length) {
      selectedSubmissions.clear();
    } else {
      queue.forEach(submission => selectedSubmissions.add(submission.id));
    }
    selectedSubmissions = selectedSubmissions;
  }
  
  async function bulkAssign(moderatorId) {
    if (selectedSubmissions.size === 0) return;
    
    try {
      const response = await fetch('/api/moderation/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'assign',
          submissionIds: Array.from(selectedSubmissions),
          moderatorId
        })
      });
      
      if (response.ok) {
        selectedSubmissions.clear();
        await loadQueue();
      }
    } catch (error) {
      console.error('Bulk assign failed:', error);
    }
  }
  
  async function autoAssign() {
    if (selectedSubmissions.size === 0) return;
    
    try {
      const response = await fetch('/api/moderation/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'auto_assign',
          submissionIds: Array.from(selectedSubmissions)
        })
      });
      
      if (response.ok) {
        selectedSubmissions.clear();
        await loadQueue();
      }
    } catch (error) {
      console.error('Auto assign failed:', error);
    }
  }
  
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'pending_review': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'escalated': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  $: canReview = permissions?.can_moderate;
  $: canEscalate = permissions?.can_escalate;
  $: hasSelection = selectedSubmissions.size > 0;
</script>

<svelte:head>
  <title>Moderation Dashboard - LaunchPadder</title>
  <meta name="description" content="Content moderation and approval dashboard" />
</svelte:head>

<div class="moderation-dashboard">
  <div class="container">
    <div class="dashboard-header">
      <h1>Moderation Dashboard</h1>
      <div class="user-info">
        <span class="user-name">{user?.email}</span>
        <div class="user-roles">
          {#each permissions?.roles || [] as role}
            <span class="role-badge role-{role}">{role}</span>
          {/each}
        </div>
      </div>
    </div>
    
    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading moderation dashboard...</p>
      </div>
    {:else}
      <!-- Statistics Cards -->
      {#if stats}
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{stats.pending_count || 0}</div>
            <div class="stat-label">Pending Review</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{stats.approved_today || 0}</div>
            <div class="stat-label">Approved Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{stats.rejected_today || 0}</div>
            <div class="stat-label">Rejected Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{stats.avg_review_time_hours?.toFixed(1) || '0.0'}h</div>
            <div class="stat-label">Avg Review Time</div>
          </div>
        </div>
      {/if}
      
      <!-- Filters and Actions -->
      <div class="controls-bar">
        <div class="filters">
          <select bind:value={filters.status} on:change={loadQueue}>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="escalated">Escalated</option>
          </select>
          
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={filters.assignedOnly}
              on:change={loadQueue}
            />
            <span>Assigned to me only</span>
          </label>
        </div>
        
        <div class="actions">
          {#if hasSelection}
            <button class="action-btn" on:click={autoAssign}>
              Auto Assign ({selectedSubmissions.size})
            </button>
            <button class="action-btn secondary" on:click={() => bulkAssign(user.id)}>
              Assign to Me
            </button>
          {/if}
          
          <button class="action-btn" on:click={loadQueue}>
            Refresh
          </button>
        </div>
      </div>
      
      <!-- Queue Table -->
      <div class="queue-table">
        <div class="table-header">
          <div class="header-cell">
            <input
              type="checkbox"
              checked={selectedSubmissions.size === queue.length && queue.length > 0}
              on:change={selectAll}
            />
          </div>
          <div class="header-cell">Title</div>
          <div class="header-cell">Status</div>
          <div class="header-cell">Submitted</div>
          <div class="header-cell">Assigned</div>
          <div class="header-cell">Actions</div>
        </div>
        
        {#each queue as submission}
          <div class="table-row">
            <div class="table-cell">
              <input
                type="checkbox"
                checked={selectedSubmissions.has(submission.id)}
                on:change={() => toggleSelection(submission.id)}
              />
            </div>
            <div class="table-cell">
              <div class="submission-title">
                <a href={submission.url} target="_blank" rel="noopener">
                  {submission.title}
                </a>
              </div>
              <div class="submission-meta">
                by {submission.users?.username || submission.users?.email}
              </div>
            </div>
            <div class="table-cell">
              <span class="status-badge {getStatusColor(submission.status)}">
                {submission.status.replace('_', ' ')}
              </span>
            </div>
            <div class="table-cell">
              {submission.submitted_for_review_at ? formatDate(submission.submitted_for_review_at) : '-'}
            </div>
            <div class="table-cell">
              {submission.assigned_moderator ? 'Assigned' : 'Unassigned'}
            </div>
            <div class="table-cell">
              {#if canReview && submission.status === 'pending_review'}
                <button
                  class="review-btn"
                  on:click={() => openReviewModal(submission)}
                >
                  Review
                </button>
              {/if}
            </div>
          </div>
        {/each}
        
        {#if queue.length === 0}
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No submissions found</h3>
            <p>There are no submissions matching your current filters.</p>
          </div>
        {/if}
      </div>
      
      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="pagination">
          <button
            class="page-btn"
            disabled={currentPage === 1}
            on:click={() => { currentPage--; loadQueue(); }}
          >
            Previous
          </button>
          
          <span class="page-info">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            class="page-btn"
            disabled={currentPage === totalPages}
            on:click={() => { currentPage++; loadQueue(); }}
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Review Modal -->
{#if showReviewModal && selectedSubmission}
  <div class="modal-overlay" on:click={() => showReviewModal = false}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Review Submission</h2>
        <button class="close-btn" on:click={() => showReviewModal = false}>×</button>
      </div>
      
      <div class="modal-body">
        <div class="submission-details">
          <h3>{selectedSubmission.title}</h3>
          <p class="submission-url">
            <a href={selectedSubmission.url} target="_blank" rel="noopener">
              {selectedSubmission.url}
            </a>
          </p>
          <p class="submission-description">{selectedSubmission.description}</p>
          
          {#if selectedSubmission.tags && selectedSubmission.tags.length > 0}
            <div class="submission-tags">
              {#each selectedSubmission.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}
          
          {#if selectedSubmission.auto_moderation_result}
            <div class="auto-moderation">
              <h4>AI Analysis</h4>
              <pre>{JSON.stringify(selectedSubmission.auto_moderation_result, null, 2)}</pre>
            </div>
          {/if}
        </div>
        
        <div class="review-form">
          <div class="form-group">
            <label>Decision</label>
            <select bind:value={reviewDecision}>
              <option value="">Select decision...</option>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              {#if canEscalate}
                <option value="escalated">Escalate</option>
              {/if}
            </select>
          </div>
          
          <div class="form-group">
            <label>Notes</label>
            <textarea
              bind:value={reviewNotes}
              placeholder="Add review notes..."
              rows="4"
            ></textarea>
          </div>
          
          {#if reviewDecision === 'escalated'}
            <div class="form-group">
              <label>Escalation Reason</label>
              <textarea
                bind:value={escalationReason}
                placeholder="Explain why this needs escalation..."
                rows="3"
                required
              ></textarea>
            </div>
          {/if}
        </div>
        
        {#if selectedSubmission.review_history && selectedSubmission.review_history.length > 0}
          <div class="review-history">
            <h4>Review History</h4>
            {#each selectedSubmission.review_history as review}
              <div class="history-item">
                <div class="history-header">
                  <span class="decision {getStatusColor(review.decision)}">{review.decision}</span>
                  <span class="date">{formatDate(review.reviewed_at)}</span>
                </div>
                {#if review.notes}
                  <p class="history-notes">{review.notes}</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      
      <div class="modal-footer">
        <button class="cancel-btn" on:click={() => showReviewModal = false}>
          Cancel
        </button>
        <button
          class="submit-btn"
          disabled={!reviewDecision || submitting || (reviewDecision === 'escalated' && !escalationReason)}
          on:click={submitReview}
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .moderation-dashboard {
    min-height: 100vh;
    background: #f8fafc;
    padding: 2rem 0;
  }
  
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 1rem;
  }
  
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .dashboard-header h1 {
    margin: 0;
    color: #1a202c;
    font-size: 2rem;
    font-weight: 700;
  }
  
  .user-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }
  
  .user-name {
    font-weight: 500;
    color: #4a5568;
  }
  
  .user-roles {
    display: flex;
    gap: 0.5rem;
  }
  
  .role-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .role-moderator {
    background: #bee3f8;
    color: #2c5282;
  }
  
  .role-senior_moderator {
    background: #d6f5d6;
    color: #276749;
  }
  
  .role-admin {
    background: #fed7d7;
    color: #c53030;
  }
  
  .loading-state {
    text-align: center;
    padding: 4rem 2rem;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e2e8f0;
    border-top: 3px solid #3182ce;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem auto;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: #2d3748;
    margin-bottom: 0.5rem;
  }
  
  .stat-label {
    color: #718096;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .filters {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  
  .filters select {
    padding: 0.5rem;
    border: 1px solid #d2d6dc;
    border-radius: 0.375rem;
    background: white;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  
  .action-btn {
    padding: 0.5rem 1rem;
    background: #3182ce;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  
  .action-btn:hover {
    background: #2c5282;
  }
  
  .action-btn.secondary {
    background: #718096;
  }
  
  .action-btn.secondary:hover {
    background: #4a5568;
  }
  
  .queue-table {
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  
  .table-header {
    display: grid;
    grid-template-columns: 50px 1fr 120px 150px 120px 100px;
    gap: 1rem;
    padding: 1rem;
    background: #f7fafc;
    border-bottom: 1px solid #e2e8f0;
    font-weight: 600;
    color: #4a5568;
  }
  
  .table-row {
    display: grid;
    grid-template-columns: 50px 1fr 120px 150px 120px 100px;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid #e2e8f0;
    align-items: center;
  }
  
  .table-row:hover {
    background: #f7fafc;
  }
  
  .submission-title a {
    color: #3182ce;
    text-decoration: none;
    font-weight: 500;
  }
  
  .submission-title a:hover {
    text-decoration: underline;
  }
  
  .submission-meta {
    font-size: 0.875rem;
    color: #718096;
    margin-top: 0.25rem;
  }
  
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .review-btn {
    padding: 0.375rem 0.75rem;
    background: #48bb78;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .review-btn:hover {
    background: #38a169;
  }
  
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }
  
  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    color: #4a5568;
  }
  
  .empty-state p {
    color: #718096;
    margin: 0;
  }
  
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
  }
  
  .page-btn {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #d2d6dc;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  
  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .page-info {
    color: #4a5568;
    font-weight: 500;
  }
  
  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal-content {
    background: white;
    border-radius: 0.5rem;
    max-width: 800px;
    width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .modal-header h2 {
    margin: 0;
    color: #1a202c;
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #718096;
  }
  
  .modal-body {
    padding: 1.5rem;
  }
  
  .submission-details {
    margin-bottom: 2rem;
  }
  
  .submission-details h3 {
    margin: 0 0 1rem 0;
    color: #1a202c;
  }
  
  .submission-url {
    margin: 0 0 1rem 0;
  }
  
  .submission-url a {
    color: #3182ce;
    text-decoration: none;
  }
  
  .submission-description {
    color: #4a5568;
    line-height: 1.6;
    margin: 0 0 1rem 0;
  }
  
  .submission-tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  
  .tag {
    padding: 0.25rem 0.5rem;
    background: #edf2f7;
    color: #4a5568;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .auto-moderation {
    background: #f7fafc;
    padding: 1rem;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
  }
  
  .auto-moderation h4 {
    margin: 0 0 0.5rem 0;
    color: #4a5568;
  }
  
  .auto-moderation pre {
    font-size: 0.875rem;
    color: #2d3748;
    margin: 0;
    white-space: pre-wrap;
  }
  
  .review-form {
    margin-bottom: 2rem;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #4a5568;
  }
  
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d2d6dc;
    border-radius: 0.375rem;
    font-size: 1rem;
  }
  
  .form-group textarea {
    resize: vertical;
    font-family: inherit;
  }
  
  .review-history {
    border-top: 1px solid #e2e8f0;
    padding-top: 1rem;
  }
  
  .review-history h4 {
    margin: 0 0 1rem 0;
    color: #4a5568;
  }
  
  .history-item {
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f7fafc;
    border-radius: 0.375rem;
  }
  
  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .history-notes {
    margin: 0;
    color: #4a5568;
    font-size: 0.875rem;
  }
  
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid #e2e8f0;
  }
  
  .cancel-btn {
    padding: 0.75rem 1.5rem;
    background: #edf2f7;
    color: #4a5568;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }
  
  .submit-btn {
    padding: 0.75rem 1.5rem;
    background: #3182ce;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }
  
  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  @media (max-width: 768px) {
    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .controls-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }
    
    .table-header,
    .table-row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    
    .table-cell {
      padding: 0.5rem 0;
    }
    
    .modal-content {
      width: 95vw;
      margin: 1rem;
    }
  }
</style>
    