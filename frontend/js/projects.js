// projects.js - Project Management Functions

const API_BASE_URL = "http://127.0.0.1:8001";

// Global variables
let currentProjectId = null;
let userProjects = [];
let currentUser = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAuthToken() {
    return localStorage.getItem('accessToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json"
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

function handleApiError(error, elementId) {
    console.error("API Error:", error);
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            const message = error.detail || error.message || "An error occurred";
            element.innerHTML = `<div class="error-message" style="background-color: #fee; color: #c00; padding: 10px; border-radius: 4px; margin: 10px 0;">${message}</div>`;
            element.style.display = 'block';
        }
    }
}

function showSuccess(message, elementId) {
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<div class="success-message" style="background-color: #efe; color: #060; padding: 10px; border-radius: 4px; margin: 10px 0;">${message}</div>`;
            element.style.display = 'block';
            setTimeout(() => {
                element.style.display = 'none';
            }, 3000);
        }
    }
}

function formatDate(dateString) {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ============================================
// INITIALIZATION
// ============================================

function initializeProjects() {
    // Decode JWT to get current user info
    const token = getAuthToken();
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = payload;
        } catch (e) {
            console.error("Error decoding token:", e);
        }
    }

    // Load projects
    loadUserProjects();

    // Set up event listeners
    setupProjectEventListeners();
}

function setupProjectEventListeners() {
    // "Add New Project" button handler
    const addProjectBtns = document.querySelectorAll('[data-action="add-project"]');
    addProjectBtns.forEach(btn => {
        btn.addEventListener('click', showAddProjectWizard);
    });
}

// ============================================
// PROJECT CRUD OPERATIONS
// ============================================

async function loadUserProjects(statusFilter = null) {
    try {
        let url = `${API_BASE_URL}/projects`;
        if (statusFilter) {
            url += `?status=${statusFilter}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const projects = await response.json();
        userProjects = projects;
        renderProjectCards(projects);
    } catch (error) {
        handleApiError(error, 'projects-error');
    }
}

function renderProjectCards(projects) {
    const container = document.getElementById('projects-container');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 col-span-3">
                <p class="text-subtext-light dark:text-subtext-dark">No projects found. Create your first project to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-semibold text-primary-light dark:text-primary-dark">${project.name}</h3>
                <span class="px-3 py-1 text-xs rounded-full ${getStatusBadgeClass(project.status)}">${project.status}</span>
            </div>

            <p class="text-sm text-subtext-light dark:text-subtext-dark mb-4 line-clamp-2">${project.description}</p>

            <div class="flex items-center justify-between mb-4">
                <span class="text-xs text-subtext-light dark:text-subtext-dark">Course: ${project.courseCode || 'N/A'}</span>
                <span class="text-xs text-subtext-light dark:text-subtext-dark">Due: ${formatDate(project.deadline)}</span>
            </div>

            <div class="mb-4">
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-subtext-light dark:text-subtext-dark">Progress</span>
                    <span class="text-primary-light dark:text-primary-dark font-semibold">${project.progress}%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div class="bg-primary-light dark:bg-primary-dark h-2 rounded-full" style="width: ${project.progress}%"></div>
                </div>
            </div>

            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    ${renderTeamAvatars(project)}
                </div>
                <button onclick="viewProjectDetails('${project.id}')"
                        class="text-sm text-primary-light dark:text-primary-dark hover:underline">
                    View Details →
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusBadgeClass(status) {
    const classes = {
        'Planning': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        'Active': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        'Completed': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        'Inactive': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
}

function renderTeamAvatars(project) {
    const teamSize = 1 + (project.teamMembers ? project.teamMembers.length : 0);
    return `<div class="flex -space-x-2">
        ${Array(Math.min(teamSize, 3)).fill(0).map((_, i) => `
            <div class="w-8 h-8 rounded-full bg-primary-light dark:bg-primary-dark text-white text-xs flex items-center justify-center border-2 border-white dark:border-gray-800">
                ${i === 0 ? 'O' : 'M'}
            </div>
        `).join('')}
        ${teamSize > 3 ? `<div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 text-xs flex items-center justify-center border-2 border-white dark:border-gray-800">+${teamSize - 3}</div>` : ''}
    </div>`;
}

function viewProjectDetails(projectId) {
    currentProjectId = projectId;
    // Navigate to project detail page
    const detailPage = document.getElementById('project-detail-page');
    if (detailPage) {
        loadProjectDetails(projectId);
        showPage('project-detail-page');
    }
}

async function loadProjectDetails(projectId) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const project = await response.json();
        renderProjectDetails(project);
    } catch (error) {
        handleApiError(error, 'project-detail-error');
    }
}

function renderProjectDetails(project) {
    // Update project detail UI
    const detailContainer = document.getElementById('project-detail-content');
    if (detailContainer) {
        detailContainer.innerHTML = `
            <h2 class="text-2xl font-bold mb-4">${project.name}</h2>
            <div class="mb-4">
                <span class="px-3 py-1 text-sm rounded-full ${getStatusBadgeClass(project.status)}">${project.status}</span>
            </div>
            <p class="mb-4">${project.description}</p>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <strong>Course Code:</strong> ${project.courseCode || 'N/A'}
                </div>
                <div>
                    <strong>Deadline:</strong> ${formatDate(project.deadline)}
                </div>
                <div>
                    <strong>Owner:</strong> ${project.ownerName}
                </div>
                <div>
                    <strong>Progress:</strong> ${project.progress}%
                </div>
            </div>
            <div id="milestones-section">
                <h3 class="text-xl font-semibold mb-3">Milestones</h3>
                ${renderMilestones(project.milestones, project.id)}
            </div>
        `;
    }
}

function renderMilestones(milestones, projectId) {
    return milestones.map(milestone => `
        <div class="mb-3 p-4 bg-gray-50 dark:bg-gray-800 rounded">
            <div class="flex justify-between items-center">
                <span class="font-medium">${milestone.name}</span>
                <select onchange="updateMilestone('${projectId}', ${milestone.order}, this.value)"
                        class="px-3 py-1 border rounded">
                    <option value="not_started" ${milestone.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                    <option value="in_progress" ${milestone.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${milestone.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        </div>
    `).join('');
}

async function createProject(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw await response.json();
        }

        const project = await response.json();
        showSuccess('Project created successfully!', 'project-form-message');
        currentProjectId = project.id;

        // Reload projects
        setTimeout(() => {
            loadUserProjects();
            showPage('projects-page');
        }, 1500);

        return project;
    } catch (error) {
        handleApiError(error, 'project-form-message');
        throw error;
    }
}

async function updateProject(projectId, updates) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            throw await response.json();
        }

        const project = await response.json();
        showSuccess('Project updated successfully!', 'project-update-message');
        return project;
    } catch (error) {
        handleApiError(error, 'project-update-message');
        throw error;
    }
}

async function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Project deleted successfully!', 'main-message');
        loadUserProjects();
        showPage('projects-page');
    } catch (error) {
        handleApiError(error, 'project-delete-message');
    }
}

async function updateMilestone(projectId, milestoneOrder, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/milestones`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                milestoneOrder: milestoneOrder,
                status: status
            })
        });

        if (!response.ok) {
            throw await response.json();
        }

        const project = await response.json();
        showSuccess('Milestone updated!', 'milestone-message');

        // Reload project details
        loadProjectDetails(projectId);
    } catch (error) {
        handleApiError(error, 'milestone-message');
    }
}

// ============================================
// TEAM MANAGEMENT
// ============================================

async function searchStudents(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/students/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        return await response.json();
    } catch (error) {
        console.error('Error searching students:', error);
        return [];
    }
}

async function sendTeamInvite(projectId, inviteeEmail) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/team/invite`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ inviteeEmail })
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Invitation sent successfully!', 'team-invite-message');
        return await response.json();
    } catch (error) {
        handleApiError(error, 'team-invite-message');
        throw error;
    }
}

async function loadTeamInvitations() {
    try {
        const response = await fetch(`${API_BASE_URL}/invitations/team?status=pending`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const invitations = await response.json();
        renderTeamInvitations(invitations);
    } catch (error) {
        console.error('Error loading team invitations:', error);
    }
}

function renderTeamInvitations(invitations) {
    const container = document.getElementById('team-invitations-container');
    if (!container) return;

    if (invitations.length === 0) {
        container.innerHTML = '<p class="text-sm text-subtext-light dark:text-subtext-dark">No pending invitations</p>';
        return;
    }

    container.innerHTML = invitations.map(invitation => `
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded mb-3">
            <p class="font-medium mb-2">${invitation.inviterName} invited you to join "${invitation.projectName}"</p>
            <div class="flex gap-2">
                <button onclick="respondToTeamInvite('${invitation.id}', true)"
                        class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                    Accept
                </button>
                <button onclick="respondToTeamInvite('${invitation.id}', false)"
                        class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                    Decline
                </button>
            </div>
        </div>
    `).join('');
}

async function respondToTeamInvite(invitationId, accept) {
    try {
        const response = await fetch(`${API_BASE_URL}/invitations/team/${invitationId}/respond`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ accept })
        });

        if (!response.ok) {
            throw await response.json();
        }

        const message = accept ? 'Invitation accepted!' : 'Invitation declined!';
        showSuccess(message, 'main-message');

        // Reload invitations and projects
        loadTeamInvitations();
        if (accept) {
            loadUserProjects();
        }
    } catch (error) {
        handleApiError(error, 'invitation-message');
    }
}

async function removeTeamMember(projectId, userId) {
    if (!confirm('Are you sure you want to remove this team member?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/team/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Team member removed!', 'team-message');
        loadProjectDetails(projectId);
    } catch (error) {
        handleApiError(error, 'team-message');
    }
}

async function updateTeamMember(projectId, userId, updates) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/team/${userId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Team member updated!', 'team-message');
        return await response.json();
    } catch (error) {
        handleApiError(error, 'team-message');
        throw error;
    }
}

// ============================================
// GUIDE MANAGEMENT (TEACHER)
// ============================================

async function loadUnassignedProjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/unassigned`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const projects = await response.json();
        renderUnassignedProjects(projects);
    } catch (error) {
        console.error('Error loading unassigned projects:', error);
    }
}

function renderUnassignedProjects(projects) {
    const container = document.getElementById('unassigned-projects-container');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = '<p class="text-subtext-light dark:text-subtext-dark">No unassigned projects available</p>';
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="p-4 bg-surface-light dark:bg-surface-dark rounded shadow mb-3">
            <h4 class="font-semibold mb-2">${project.name}</h4>
            <p class="text-sm text-subtext-light dark:text-subtext-dark mb-2">${project.description.substring(0, 100)}...</p>
            <button onclick="sendGuideRequest('${project.id}')"
                    class="px-4 py-2 bg-primary-light dark:bg-primary-dark text-white rounded hover:opacity-90 text-sm">
                Request to Guide
            </button>
        </div>
    `).join('');
}

async function sendGuideRequest(projectId) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/guide/request`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Guide request sent!', 'guide-message');
        loadUnassignedProjects();
    } catch (error) {
        handleApiError(error, 'guide-message');
    }
}

async function loadGuideRequests(type = 'received') {
    try {
        const response = await fetch(`${API_BASE_URL}/requests/guide?type=${type}&status=pending`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const requests = await response.json();
        renderGuideRequests(requests, type);
    } catch (error) {
        console.error('Error loading guide requests:', error);
    }
}

function renderGuideRequests(requests, type) {
    const container = document.getElementById('guide-requests-container');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-sm text-subtext-light dark:text-subtext-dark">No pending requests</p>';
        return;
    }

    container.innerHTML = requests.map(request => `
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded mb-3">
            <p class="font-medium mb-2">${request.teacherName} wants to guide "${request.projectName}"</p>
            ${type === 'received' ? `
                <div class="flex gap-2">
                    <button onclick="respondToGuideRequest('${request.id}', true)"
                            class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        Accept
                    </button>
                    <button onclick="showDeclineReasonForm('${request.id}')"
                            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                        Decline
                    </button>
                </div>
                <div id="decline-form-${request.id}" style="display: none;" class="mt-3">
                    <textarea id="decline-reason-${request.id}"
                              class="w-full p-2 border rounded"
                              placeholder="Reason for declining..."
                              rows="3"></textarea>
                    <button onclick="respondToGuideRequest('${request.id}', false, document.getElementById('decline-reason-${request.id}').value)"
                            class="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                        Submit Decline
                    </button>
                </div>
            ` : `
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Status: ${request.status}</p>
            `}
        </div>
    `).join('');
}

function showDeclineReasonForm(requestId) {
    const form = document.getElementById(`decline-form-${requestId}`);
    if (form) {
        form.style.display = 'block';
    }
}

async function respondToGuideRequest(requestId, accept, declineReason = null) {
    try {
        const body = { accept };
        if (!accept && declineReason) {
            body.declineReason = declineReason;
        }

        const response = await fetch(`${API_BASE_URL}/requests/guide/${requestId}/respond`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw await response.json();
        }

        const message = accept ? 'Guide request accepted!' : 'Guide request declined!';
        showSuccess(message, 'main-message');

        // Reload guide requests and projects
        loadGuideRequests('received');
        loadUserProjects();
    } catch (error) {
        handleApiError(error, 'guide-request-message');
    }
}

async function updateDeadline(projectId, deadline) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/deadline`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ deadline })
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Deadline updated!', 'deadline-message');
        return await response.json();
    } catch (error) {
        handleApiError(error, 'deadline-message');
        throw error;
    }
}

// ============================================
// WIZARD/FORM HANDLERS
// ============================================

function showAddProjectWizard() {
    const wizardPage = document.getElementById('add-project-page');
    if (wizardPage) {
        showPage('add-project-page');
    }
}

function handleStep1Submit(event) {
    event.preventDefault();

    const name = document.getElementById('project-name').value;
    const description = document.getElementById('project-description').value;
    const courseCode = document.getElementById('course-code').value;

    const formData = {
        name,
        description,
        courseCode: courseCode || null,
        deadline: null
    };

    createProject(formData);
}

// Helper function to navigate between pages (if using page system)
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
        page.style.opacity = '0';
    });

    // Show selected page
    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.remove('hidden');
        setTimeout(() => {
            selectedPage.style.opacity = '1';
        }, 10);
    }
}

// Make functions globally accessible
window.initializeProjects = initializeProjects;
window.loadUserProjects = loadUserProjects;
window.viewProjectDetails = viewProjectDetails;
window.createProject = createProject;
window.updateProject = updateProject;
window.deleteProject = deleteProject;
window.updateMilestone = updateMilestone;
window.searchStudents = searchStudents;
window.sendTeamInvite = sendTeamInvite;
window.loadTeamInvitations = loadTeamInvitations;
window.respondToTeamInvite = respondToTeamInvite;
window.removeTeamMember = removeTeamMember;
window.updateTeamMember = updateTeamMember;
window.loadUnassignedProjects = loadUnassignedProjects;
window.sendGuideRequest = sendGuideRequest;
window.loadGuideRequests = loadGuideRequests;
window.respondToGuideRequest = respondToGuideRequest;
window.showDeclineReasonForm = showDeclineReasonForm;
window.updateDeadline = updateDeadline;
window.showAddProjectWizard = showAddProjectWizard;
window.handleStep1Submit = handleStep1Submit;
