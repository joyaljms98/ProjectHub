// projects.js - Project Management Functions

const API_BASE_URL = "http://127.0.0.1:8001";

// Global variables
let currentProjectId = null;
let userProjects = [];
let guidedStudentIds = new Set();
// let currentUser = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAuthToken() {
    return localStorage.getItem('accessToken');
}

function getAuthHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

/**
 * Displays an error message in a specified element.
 * @param {object | string} error - The error object (with .detail) or a string message.
 * @param {string} elementId - The ID of the HTML element to display the error in.
 */
function handleApiError(error, elementId) {
    console.error("API Error:", error);
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            const message = error.detail || error.message || "An unknown error occurred";
            element.innerHTML = `<div class="error-message" style="background-color: #fee; color: #c00; padding: 10px; border-radius: 4px; margin: 10px 0;">${message}</div>`;
            element.style.display = 'block';
        }
    }
}

/**
 * Displays a temporary success message in a specified element.
 * @param {string} message - The success message to display.
 * @param {string} elementId - The ID of the HTML element to display the message in.
 */
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

/**
 * Initializes the project management system on page load.
 */
// function initializeProjects() {
//     // Decode JWT to get current user info
//     const token = getAuthToken();
//     if (token) {
//         try {
//             const payload = JSON.parse(atob(token.split('.')[1]));
//             currentUser = payload;
//             currentUser.role = payload.role; // <-- ADD THIS
//             currentUser.sub = payload.sub;   // <-- ADD THIS (this is the user's email/ID)
//         } catch (e) {
//             console.error("Error decoding token:", e);
//         }
//     }

    // Load projects
    // loadUserProjects();

    // // Set up event listeners
    // setupProjectEventListeners();
// }

/**
 * Sets up global event listeners for project-related forms and buttons.
 */
function setupProjectEventListeners() {
    // "Add New Project" button handler (from dashboard)
    const addProjectBtns = document.querySelectorAll('button[data-target="add-project-page"]');
    addProjectBtns.forEach(btn => {
        btn.addEventListener('click', showAddProjectWizard);
    });

    // Project creation form (Step 1) submit handler
    const projectForm = document.getElementById('add-project-form-step1');
    if (projectForm) {
        projectForm.addEventListener('submit', handleStep1Submit);
    }
}

// ============================================
// PROJECT CRUD OPERATIONS
// ============================================

/**
 * Fetches and displays the current user's projects.
 * @param {string | null} statusFilter - Optional status to filter by.
 */
async function loadUserProjects(statusFilter = null) {
    try {
        let url = `${API_BASE_URL}/projects`;
        const params = new URLSearchParams();
        if (statusFilter) {
            params.append('status', statusFilter);
        }
        if (projectHubUser && projectHubUser.role === 'Teacher') {
             params.append('role', 'guide');
        }
        
        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const projects = await response.json();
        // Clear and repopulate the set of guided student IDs
        guidedStudentIds.clear();
        if (projectHubUser && projectHubUser.role === 'Teacher') {
            const guidedProjects = projects.filter(p => p.guideId === projectHubUser._id);
            for (const project of guidedProjects) {
                guidedStudentIds.add(project.ownerId);
                project.teamMembers.forEach(member => guidedStudentIds.add(member.userId));
            }
        }

        userProjects = projects;
        renderProjectCards(projects);
        renderDashboardProjects(projects); 
        renderActiveTeams(projects);
        renderDashboardActiveProjects(projects); 
        renderGuidedProjectsTable(projects);
        renderGuidedTeams(projects);
    } catch (error) {
        // Display the error on ALL relevant dashboards (student and teacher)
        handleApiError(error, 'projects-container'); // Student "Projects" page
        handleApiError(error, 'dashboard-projects-container'); // Student "Dashboard"
        handleApiError(error, 'dashboard-active-projects'); // Teacher "Dashboard"
        
        // Special handling for the teacher's table
        const teacherTableBody = document.getElementById('guided-projects-table-body');
        if (teacherTableBody) {
             const errorMessage = error.detail || error.message || "Could not load projects.";
             teacherTableBody.innerHTML = `<tr><td colspan="5" class="py-4 px-4 text-center text-red-500">${errorMessage}</td></tr>`;
        }
    }
}

/**
 * Renders the project cards into the DOM.
 * @param {Array} projects - An array of project objects.
 */
function renderProjectCards(projects) {
    const container = document.getElementById('projects-container');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 col-span-3 text-subtext-light dark:text-subtext-dark">
                <p>No projects found. Create your first project to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="bg-card-light dark:bg-card-dark rounded-xl shadow-subtle p-6 border border-border-light dark:border-border-dark flex flex-col justify-between hover:shadow-lg transition-shadow">
            <div>
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-lg font-bold text-text-light dark:text-text-dark">${project.name}</h3>
                    <span class="px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(project.status)}">${project.status}</span>
                </div>
                <p class="text-sm text-subtext-light dark:text-subtext-dark mb-4 line-clamp-2">${project.description}</p>
                <div class="flex items-center justify-between mb-4">
                    <span class="text-xs text-subtext-light dark:text-subtext-dark">Course: ${project.courseCode || 'N/A'}</span>
                    <span class="text-xs text-subtext-light dark:text-subtext-dark">Due: ${formatDate(project.deadline)}</span>
                </div>
                <div class="mb-4">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-subtext-light dark:text-subtext-dark">Progress</span>
                        <span class="text-primary font-semibold">${project.progress}%</span>
                    </div>
                    <div class="w-full bg-background-light dark:bg-background-dark rounded-full h-2 border border-border-light dark:border-border-dark">
                        <div class="bg-primary h-full rounded-full" style="width: ${project.progress}%"></div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between mt-2">
                <div class="flex items-center gap-2">
                    ${renderTeamAvatars(project)}
                </div>
                
                <button onclick="viewProjectDetails('${project._id}')"
                        class="text-sm text-primary hover:underline font-medium">
                    View Details →
                </button>
            </div>
        </div>
    `).join('');
}


function renderActiveTeams(projects) {
    const container = document.getElementById('active-teams-container');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark col-span-3 px-4">You are not part of any teams yet.</p>`;
        return;
    }

    container.innerHTML = projects.map(project => {
        // Create avatar list
        const ownerAvatar = `<div title="${project.ownerName} (Owner)" class="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-card-dark bg-primary text-white text-xs flex items-center justify-center font-semibold">${project.ownerName.charAt(0).toUpperCase()}</div>`;
        const memberAvatars = project.teamMembers.map(member => 
            `<div title="Team Member" class="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-card-dark bg-accent-dark text-white text-xs flex items-center justify-center">${member.userId.charAt(0).toUpperCase()}</div>`
        ).join('');
        
        return `
        <div class="rounded-xl shadow-subtle bg-card-light dark:bg-card-dark p-6 flex flex-col justify-between border border-border-light dark:border-border-dark">
            <div>
                <p class="text-subtext-light dark:text-subtext-dark text-sm font-normal leading-normal">${project.courseCode || 'Project'}</p>
                <p class="text-text-light dark:text-text-dark text-lg font-bold tracking-[-0.015em] mt-1 truncate">${project.name}</p>
                <div class="flex items-center mt-4">
                    <div class="flex -space-x-2">
                        ${ownerAvatar}
                        ${memberAvatars}
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between mt-6">
                <button class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors duration-200"
                        onclick="viewProjectDetails('${project._id}')">
                    <span class="truncate">View Project</span>
                </button>
            </div>
        </div>
        `;
    }).join('');
}


/**
 * Renders the project list for the dashboard widget.
 * @param {Array} projects - An array of project objects.
 */
function renderDashboardProjects(projects) {
    const container = document.getElementById('dashboard-projects-container');
    if (!container) return; // Exit if element isn't on the page

    // Let's show just the first 3 active projects
    const activeProjects = projects.filter(p => p.status === 'Active' || p.status === 'Planning').slice(0, 3);

    if (activeProjects.length === 0) {
        container.innerHTML = `<p class="text-sm text-subtext-light dark:text-subtext-dark">You have no active projects. Click 'Add New Project' to start!</p>`;
        return;
    }

    // Create the HTML for the dashboard list
    container.innerHTML = activeProjects.map(project => `
        <div class="flex justify-between items-center p-4 bg-background-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark mt-1">${project.name}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Status: ${project.status}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-primary font-semibold">${project.progress}%</span>
                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                     <span class="material-icons-outlined text-primary text-base">task_alt</span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderDashboardActiveProjects(projects) {
    const container = document.getElementById('dashboard-active-projects');
    if (!container) return; // Exit if not on the right page

    // Filter for projects this teacher is guiding
    const guidedProjects = projects.filter(p => p.guideId === projectHubUser._id).slice(0, 3);

    if (guidedProjects.length === 0) {
        container.innerHTML = `<p class="text-sm text-subtext-light dark:text-subtext-dark p-4">You are not guiding any projects yet.</p>`;
        return;
    }

    container.innerHTML = guidedProjects.map(project => `
        <div class="flex justify-between items-center p-4 bg-background-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark mt-1">${project.name}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Owner: ${project.ownerName}</p>
            </div>
            <div class="flex -space-x-2">
                <div title="${project.ownerName}" class="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-card-dark bg-primary text-white text-xs flex items-center justify-center font-semibold">${project.ownerName.charAt(0).toUpperCase()}</div>
            </div>
        </div>
    `).join('');
}

function renderDashboardUnassigned(projects) {
    const container = document.getElementById('dashboard-unassigned-tab');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `<p class="text-sm text-subtext-light dark:text-subtext-dark p-4">No unassigned projects in your department.</p>`;
        return;
    }

    // Get the first 3 projects
    const projectsToShow = projects.slice(0, 3);
    
    // Generate HTML for the projects
    let html = projectsToShow.map(project => `
        <div class="p-4 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark flex items-center justify-between">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">${project.name}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Owner: ${project.ownerName}</p>
            </div>
            <button onclick="viewProjectDetails('${project._id}')" class="px-3 py-1 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20">
                View
            </button>
        </div>
    `).join('<div class="h-2"></div>');

    // Add a "See More" button if there are more projects than shown
    if (projects.length > 3) {
        html += `
            <button class="nav-link text-sm font-medium text-primary hover:underline mt-4 w-full text-center" data-target="projects-page">
                View All ${projects.length} Unassigned Projects →
            </button>
        `;
    }

    container.innerHTML = html;
}

function renderDashboardSentRequests(requests) {
    const container = document.getElementById('dashboard-sent-requests-tab');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = `<p class="text-sm text-subtext-light dark:text-subtext-dark p-4">You have no pending sent requests.</p>`;
        return;
    }

    container.innerHTML = requests.slice(0, 3).map(request => `
        <div class="p-4 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark flex items-center justify-between">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">${request.projectName}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">To: ${request.ownerName}</p>
            </div>
            <span class="text-sm font-medium text-yellow-600">Pending</span>
        </div>
    `).join('<div class="h-2"></div>');
}

function renderGuidedProjectsTable(projects) {
    const container = document.getElementById('guided-projects-table-body');
    if (!container) return;

    // Filter for projects this teacher is guiding
    const guidedProjects = projects.filter(p => p.guideId === projectHubUser._id);

    if (guidedProjects.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="py-4 px-4 text-center text-subtext-light dark:text-subtext-dark">You are not guiding any projects.</td></tr>`;
        return;
    }

    container.innerHTML = guidedProjects.map(project => `
        <tr class="border-b border-border-light dark:border-border-dark">
            <td class="py-4 px-4 font-medium">${project.name}</td>
            <td class="py-4 px-4 text-subtext-light dark:text-subtext-dark">${project.ownerName}</td>
            <td class="py-4 px-4">
                <div class="w-full bg-background-light dark:bg-border-dark rounded-full h-2.5">
                    <div class="bg-blue-500 h-2.5 rounded-full" style="width: ${project.progress}%"></div>
                </div>
            </td>
            <td class="py-4 px-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(project.status)}">
                    ${project.status}
                </span>
            </td>
            <td class="py-4 px-4">
                <button onclick="viewProjectDetails('${project._id}')" class="text-primary hover:underline font-medium text-sm">View Details</button>
            </td>
        </tr>
    `).join('');
    if (window.smoothScroller) {
        window.smoothScroller.resize();
    }
}

if (typeof refreshSmoothScrollHeight === 'function') {
    refreshSmoothScrollHeight();
}

function getStatusBadgeClass(status) {
    const classes = {
        'Planning': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        'Active': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        'Completed': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        'Inactive': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
}

function renderTeamAvatars(project) {
    // Placeholder logic: creates avatars for owner + team members
    const ownerAvatar = `<div title="${project.ownerName} (Owner)" class="w-8 h-8 rounded-full bg-primary text-white text-xs flex items-center justify-center border-2 border-white dark:border-card-dark font-semibold">${project.ownerName.charAt(0).toUpperCase()}</div>`;
    
    const memberAvatars = project.teamMembers.map(member => 
        `<div title="${member.userId}" class="w-8 h-8 rounded-full bg-accent-dark text-white text-xs flex items-center justify-center border-2 border-white dark:border-card-dark">${member.userId.charAt(0).toUpperCase()}</div>`
    ).join('');

    return `<div class="flex -space-x-2">${ownerAvatar}${memberAvatars}</div>`;
}

function viewProjectDetails(projectId) {
    currentProjectId = projectId;
    // Navigate to project detail page
    const detailPage = document.getElementById('project-detail-page');
    if (detailPage) {
        loadProjectDetails(projectId);
        // Assumes a global `showPage` function exists from `dashboard_common.js`
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
        handleApiError(error, 'project-detail-container');
    }
}

function renderProjectDetails(project) {
    const milestonesContainer = document.getElementById('project-milestones-container');
    if (milestonesContainer) {
        milestonesContainer.innerHTML = renderMilestones(project.milestones, project._id, project.status);
    }
    // Update other fields
    document.getElementById('project-detail-name').textContent = project.name;
    document.getElementById('project-detail-description').textContent = project.description;
    document.getElementById('project-detail-team-list').innerHTML = renderProjectDetailTeam(project);

    // --- ADD THIS NEW SECTION FOR TEACHER ACTIONS ---
    const actionsContainer = document.getElementById('project-detail-actions');
    if (actionsContainer) {
        if (projectHubUser.role === 'Teacher' && !project.guideId) {
            // Project is unassigned, show "Request to Guide" button
            actionsContainer.innerHTML = `
                <div id="project-detail-message"></div>
                <button onclick="sendGuideRequest('${project._id}')" class="flex items-center justify-center gap-2 min-w-[84px] cursor-pointer rounded-xl h-12 px-6 bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90">
                    <span class="material-icons-outlined">gavel</span>
                    <span class="truncate">Request to Guide This Project</span>
                </button>
            `;
        } else if (projectHubUser.role === 'Teacher' && project.guideId === projectHubUser._id) { // 'sub' holds the user ID from the token
            // This teacher is already the guide, show deadline setter
            actionsContainer.innerHTML = `
                <h4 class="text-lg font-semibold text-text-light dark:text-text-dark mb-2">Guide Actions</h4>
                <div id="project-detail-message"></div>
                <div class="flex items-center gap-2">
                    <label for="project-deadline-input" class="text-sm font-medium">Set Deadline:</label>
                    <input type="date" id="project-deadline-input" class="form-input rounded-lg border-border-light dark:border-border-dark bg-background-light dark:bg-card-dark/50">
                    <button onclick="updateDeadline('${project._id}', document.getElementById('project-deadline-input').value)" class="flex items-center justify-center gap-2 cursor-pointer rounded-xl h-10 px-4 bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90">
                        Set
                    </button>
                </div>
            `;
            // Set the input's current value if a deadline exists
            if (project.deadline) {
                document.getElementById('project-deadline-input').value = new Date(project.deadline).toISOString().split('T')[0];
            }
        } else {
            actionsContainer.innerHTML = ''; 
        }
    }

    //
    // ** THIS IS THE FIX FOR THE SCROLLING BUG **
    // It must be at the *end* of the function.
    if (window.smoothScroller) {
        window.smoothScroller.resize();
    }
}

function renderProjectDetailTeam(project) {
    const ownerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm">${project.ownerName.charAt(0).toUpperCase()}</div>
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">${project.ownerName}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Project Owner</p>
            </div>
        </div>
    `;

    const membersHTML = project.teamMembers.map(member => `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-accent-dark text-white flex items-center justify-center font-semibold text-sm">${member.userId.charAt(0).toUpperCase()}</div>
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">(Name N/A)</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Team Member</p>
            </div>
        </div>
    `).join(''); // Note: We'd need to fetch member names for a richer view, but this works for now.

    return ownerHTML + membersHTML;
}

function renderMilestones(milestones, projectId, projectStatus) {
    const statusMap = {
        "not_started": { icon: "radio_button_unchecked", color: "text-subtext-light dark:text-subtext-dark", bgColor: "bg-gray-100 dark:bg-gray-800" },
        "in_progress": { icon: "edit", color: "text-primary dark:text-accent-light", bgColor: "bg-primary/10 dark:bg-primary/20", pulse: "animate-pulse" },
        "completed": { icon: "check_circle", color: "text-green-500", bgColor: "bg-green-100 dark:bg-green-900/50" }
    };
    
    const isEditable = (projectHubUser.role === 'Student') && (projectStatus ==='Planning' || projectStatus === 'Active');

    return milestones.sort((a, b) => a.order - b.order).map(milestone => {
        const config = statusMap[milestone.status] || statusMap["not_started"];
        return `
            <div class="flex items-center gap-4 bg-card-light dark:bg-card-dark px-4 py-3 rounded-lg border border-border-light dark:border-border-dark justify-between ${config.pulse || ''}">
                <div class="flex items-center gap-4">
                    <div class="${config.color} flex items-center justify-center rounded-full ${config.bgColor} shrink-0 size-12">
                        <span class="material-icons-outlined">${config.icon}</span>
                    </div>
                    <div class="flex flex-col justify-center">
                        <p class="text-text-light dark:text-text-dark text-base font-medium leading-normal line-clamp-1">${milestone.name}</p>
                        <p class="text-subtext-light dark:text-subtext-dark text-sm font-normal leading-normal line-clamp-2">${milestone.status.replace('_', ' ')}</p>
                    </div>
                </div>
                ${isEditable ? `
                <div class="shrink-0">
                    <select class="form-select rounded-lg border-border-light dark:border-border-dark bg-background-light dark:bg-card-dark/50 focus:border-primary focus:ring-primary text-text-light dark:text-text-dark" 
                            onchange="updateMilestone('${projectId}', ${milestone.order}, this.value)">
                        <option value="not_started" ${milestone.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                        <option value="in_progress" ${milestone.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="completed" ${milestone.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                ` : `
                <div class="shrink-0">
                     <span class="text-sm font-medium text-subtext-light dark:text-subtext-dark">Locked</span>
                </div>
                `}
            </div>
        `;
    }).join('');
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
        showSuccess('Project created! Now add your team.', 'project-form-message');
        
        currentProjectId = project._id; // This is already fixed

        // Reload projects in the background
        loadUserProjects();
        
        // Move to Step 2 (Team Page)
        showPage('add-project-step2-page'); 
        renderTeamManagementPage(project);


    } catch (error) {
        handleApiError(error, 'project-form-message');
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
        showSuccess('Project updated successfully!', 'project-detail-message');
        return project;
    } catch (error) {
        handleApiError(error, 'project-detail-message');
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

        showSuccess('Project deleted successfully!', 'projects-container'); // Show message in main list
        loadUserProjects();
        showPage('projects-page');
    } catch (error) {
        handleApiError(error, 'project-detail-message'); // Show error on detail page if that's where delete was triggered
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
        
        // Reload project details to show updated progress and milestone
        renderProjectDetails(project);
    } catch (error) {
        // Find a place to show milestone errors
        handleApiError(error, 'project-detail-message'); 
    }
}

// ============================================
// TEAM MANAGEMENT
// ============================================

async function searchStudents(query) {
    if (query.length < 2) {
        document.getElementById('team-search-results').innerHTML = '';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/students/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }
        
        const students = await response.json();
        renderStudentSearchResults(students);
    } catch (error) {
        console.error('Error searching students:', error);
        document.getElementById('team-search-results').innerHTML = `<p class="text-red-500">${error.message || 'Error searching'}</p>`;
    }
}

function renderStudentSearchResults(students) {
    const resultsContainer = document.getElementById('team-search-results');
    if (students.length === 0) {
        resultsContainer.innerHTML = '<p class="text-subtext-light dark:text-subtext-dark p-2">No students found.</p>';
        return;
    }
    
    resultsContainer.innerHTML = students.map(student => `
        <div class="flex items-center justify-between p-2 hover:bg-background-light dark:hover:bg-background-dark rounded-lg">
            <div>
                <p class="font-medium">${student.fullName}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">${student.email}</p>
            </div>
            <button class="px-3 py-1 bg-primary text-white rounded-lg text-sm hover:bg-primary/90" 
                    onclick="sendTeamInvite('${currentProjectId}', '${student.email}')">
                Invite
            </button>
        </div>
    `).join('');
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
        loadSentInvitations();
        
    } catch (error) {
        handleApiError(error, 'team-invite-message');
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
        renderDashboardInvitations(invitations); // <-- ADD THIS LINE

    } catch (error) {
        console.error('Error loading team invitations:', error);
    }
}

function renderTeamInvitations(invitations) {
    const container = document.getElementById('team-invitations-container');
    if (!container) return;

    if (invitations.length === 0) {
        container.innerHTML = '<p class="text-sm text-subtext-light dark:text-subtext-dark">You have no new project invitations.</p>'; // <-- SIMPLIFIED
        return;
    }

    container.innerHTML = invitations.map(invitation => `
        <div class="bg-card-light dark:bg-card-dark rounded-xl shadow-subtle p-6 border border-border-light dark:border-border-dark mx-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p class="text-text-light dark:text-text-dark font-semibold">Invitation to join "${invitation.projectName}"</p>
                    <p class="text-sm text-subtext-light dark:text-subtext-dark">From: ${invitation.inviterName}</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button onclick="respondToTeamInvite('${invitation._id}', true)" class="rounded-lg px-4 py-2 text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors">Accept</button>
                    <button onclick="respondToTeamInvite('${invitation._id}', false)" class="rounded-lg px-4 py-2 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Decline</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderDashboardInvitations(invitations) {
    const container = document.getElementById('dashboard-invitations-container');
    if (!container) return;

    if (invitations.length === 0) {
        container.innerHTML = `<p class="text-sm text-subtext-light dark:text-subtext-dark">You have no new invitations.</p>`; // <-- EDITED
        return;
    }

    // Show a summary of invitations
    container.innerHTML = invitations.map(invitation => `
        <div class="p-3 bg-background-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
            <p class="text-sm font-medium text-text-light dark:text-text-dark">Invite to join "${invitation.projectName}"</p>
            <p class="text-xs text-subtext-light dark:text-subtext-dark">From: ${invitation.inviterName}</p>
        </div>
    `).join('<div class="h-2"></div>'); // Add a small space between invites
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
        showSuccess(message, 'teams-page-message'); // A general message area on the teams page

        // Reload invitations and projects
        loadTeamInvitations();
        loadSentInvitations();
        if (accept) {
            loadUserProjects();
        }
    } catch (error) {
        handleApiError(error, 'teams-page-message');
    }
}

async function loadSentInvitations() {
    try {
        // We call the same endpoint, but specify type=sent
        const response = await fetch(`${API_BASE_URL}/invitations/team?type=sent&status=pending`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw await response.json();
        }

        const invitations = await response.json();
        renderSentInvitations(invitations);
    } catch (error) {
        console.error('Error loading sent invitations:', error);
        const container = document.getElementById('sent-invitations-container');
        if(container) container.innerHTML = `<p class="text-red-500 px-4">${error.message || 'Could not load sent invites'}</p>`
    }
}

function renderSentInvitations(invitations) {
    const container = document.getElementById('sent-invitations-container');
    if (!container) return;

    if (invitations.length === 0) {
        container.innerHTML = '<p class="text-sm text-subtext-light dark:text-subtext-dark">You have no pending sent invitations.</p>'; // <-- SIMPLIFIED
        return;
    }

    container.innerHTML = invitations.map(invitation => `
        <div class="bg-card-light dark:bg-card-dark rounded-xl shadow-subtle p-4 border border-border-light dark:border-border-dark mx-4 mb-3">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <p class="text-text-light dark:text-text-dark font-medium">Sent to ${invitation.inviteeName} for "${invitation.projectName}"</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <span class="rounded-lg px-4 py-2 text-sm font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">Pending</span>
                </div>
            </div>
        </div>
    `).join('');
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

        showSuccess('Team member removed!', 'team-management-message');
        loadProjectDetails(projectId); // Reload details to update team list
    } catch (error) {
        handleApiError(error, 'team-management-message');
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

        showSuccess('Team member updated!', 'team-management-message');
        return await response.json();
    } catch (error) {
        handleApiError(error, 'team-management-message');
        throw error;
    }
}

// ============================================
// GUIDE MANAGEMENT
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
        renderDashboardUnassigned(projects);
    } catch (error) {
        console.error('Error loading unassigned projects:', error);
        // Use handleApiError which correctly parses "error.detail"
        // Also, report the error to BOTH the dashboard and the projects page
        handleApiError(error, 'unassigned-projects-container');
        handleApiError(error, 'dashboard-unassigned-tab');
    }
}

function renderUnassignedProjects(projects) {
    const container = document.getElementById('unassigned-projects-container');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = '<p class="text-subtext-light dark:text-subtext-dark p-4">No unassigned projects found in your department.</p>';
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="p-4 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark flex items-center justify-between">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">${project.name}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">Owner: ${project.ownerName}</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="sendGuideRequest('${project._id}')"
                        class="px-4 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20">
                    Request to Guide
                </button>
            </div>
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

        showSuccess('Guide request sent!', 'teacher-dashboard-message');
        loadUnassignedProjects(); // Refresh the list
        loadGuideRequests('sent'); // Refresh sent requests
    } catch (error) {
        handleApiError(error, 'teacher-dashboard-message');
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
        if (type === 'received') {
            renderGuideRequests_Student(requests);
        } else {
            renderGuideRequests_Teacher(requests);
            renderDashboardSentRequests(requests);
        }
    } catch (error) {
        console.error('Error loading guide requests:', error);
    }
}

function renderGuideRequests_Student(requests) {
    const container = document.getElementById('guide-invitations-container');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-sm text-subtext-light dark:text-subtext-dark">No pending guide requests</p>'; // <-- SIMPLIFIED
        return;
    }

    container.innerHTML = requests.map(request => `
        <div class="bg-card-light dark:bg-card-dark rounded-xl shadow-subtle p-6 border border-border-light dark:border-border-dark mx-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p class="text-text-light dark:text-text-dark font-semibold">${request.teacherName} wants to guide your project "${request.projectName}"</p>
                    <p class="text-sm text-subtext-light dark:text-subtext-dark">Sent: ${formatDate(request.createdAt)}</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button onclick="respondToGuideRequest('${request._id}', true)" class="rounded-lg px-4 py-2 text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors">Accept</button>
                    <button onclick="showDeclineReasonForm('${request._id}')" class="rounded-lg px-4 py-2 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Decline</button>
                </div>
            </div>
            <div id="decline-form-${request._id}" style="display: none;" class="mt-4">
                <label class="text-sm font-medium text-text-light dark:text-text-dark">Reason for declining (Required)</label>
                <textarea id="decline-reason-${request._id}" class="mt-1 form-textarea w-full rounded-lg border-border-light dark:border-border-dark bg-background-light dark:bg-card-dark/50" rows="3"></textarea>
                <button onclick="respondToGuideRequest('${request._id}', false, document.getElementById('decline-reason-${request._id}').value)" class="mt-2 rounded-lg px-4 py-2 text-sm font-medium bg-red-700 text-white hover:bg-red-800 transition-colors">Submit Decline</button>
            </div>
        </div>
    `).join('');
}

function renderGuideRequests_Teacher(requests) {
    const container = document.getElementById('sent-guide-requests-container');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-subtext-light dark:text-subtext-dark p-4">No pending sent requests.</p>';
        return;
    }

    container.innerHTML = requests.map(request => `
         <div class="p-4 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark flex items-center justify-between">
            <div>
                <p class="font-semibold text-text-light dark:text-text-dark">${request.projectName}</p>
                <p class="text-sm text-subtext-light dark:text-subtext-dark">To: ${request.ownerName}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-yellow-600">Pending</span>
            </div>
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
    if (!accept && (!declineReason || declineReason.trim() === '')) {
        handleApiError({ message: 'Decline reason is required.' }, 'teams-page-message');
        return;
    }
    
    try {
        const body = { accept };
        if (!accept) {
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
        showSuccess(message, 'teams-page-message');

        // Reload guide requests and projects
        loadGuideRequests('received');
        loadUserProjects();
    } catch (error) {
        handleApiError(error, 'teams-page-message');
    }
}

async function updateDeadline(projectId, deadline) {
    if (!deadline) {
        handleApiError({message: "Please select a valid date."}, 'project-detail-message');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/deadline`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ deadline })
        });

        if (!response.ok) {
            throw await response.json();
        }

        showSuccess('Deadline updated!', 'project-detail-message');
        const project = await response.json();
        renderProjectDetails(project); // Refresh details
        
    } catch (error) {
        handleApiError(error, 'project-detail-message');
        throw error;
    }
}

// ============================================
// WIZARD/FORM HANDLERS
// ============================================

function showAddProjectWizard() {
    // This assumes `showPage` is globally available from dashboard_common.js
    showPage('add-project-page');
    // Clear the form for a new project
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('course-code').value = '';
    currentProjectId = null; // Ensure we are creating a new project
}

async function handleStep1Submit(event) {
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

    // --- ADD THIS TRY...CATCH BLOCK ---
    try {
        // createProject will now handle showing errors or moving to the next step
        await createProject(formData);
    } catch (error) {
        // The error is already displayed by createProject,
        // but we catch it here to prevent an uncaught promise rejection.
        console.error("Project creation failed:", error.message);
    }
}

/**
 * Renders the team management page (Step 2 of wizard)
 * @param {object} project - The newly created project object.
 */
function renderTeamManagementPage(project) {
    const container = document.getElementById('add-project-step2-page');
    if (!container) return;
    
    container.innerHTML = `
        <div class="bg-card-light dark:bg-card-dark p-8 rounded-xl shadow-subtle w-full max-w-4xl mx-auto border border-border-light dark:border-border-dark">
            <div class="flex items-center mb-8">
                <div class="flex items-center text-green-500 relative">
                    <div class="rounded-full h-10 w-10 border-2 border-green-500 bg-green-100 flex items-center justify-center">
                        <span class="material-icons-outlined">check</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-green-500">Details</div>
                </div>
                <div class="flex-auto border-t-2 border-green-500"></div>
                <div class="flex items-center text-primary relative">
                    <div class="rounded-full h-10 w-10 border-2 border-primary bg-primary flex items-center justify-center">
                        <span class="text-white font-bold">2</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-primary">Team</div>
                </div>
                <div class="flex-auto border-t-2 border-border-light dark:border-border-dark"></div>
                <div class="flex items-center text-gray-500 relative">
                    <div class="rounded-full h-10 w-10 border-2 border-border-light dark:border-border-dark flex items-center justify-center">
                        <span class="font-bold">3</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-subtext-light dark:text-subtext-dark">Guide</div>
                </div>
            </div>
            
            <div id="team-invite-message"></div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 class="text-lg font-semibold text-text-light dark:text-text-dark mb-4">Invite Team Members (Max 3)</h3>
                    <label for="team-search-input" class="text-sm font-medium">Search Students by Name or Email</label>
                    <input type="text" id="team-search-input" onkeyup="searchStudents(this.value)" class="mt-1 form-input w-full rounded-xl border-border-light dark:border-border-dark bg-background-light dark:bg-card-dark/50" placeholder="e.g., Jane Doe">
                    <div id="team-search-results" class="mt-4 max-h-48 overflow-y-auto space-y-2">
                        </div>
                </div>
                
                <div>
                    <h3 class="text-lg font-semibold text-text-light dark:text-text-dark mb-4">Current Team</h3>
                    <div id="current-team-list" class="space-y-3">
                        <div class="flex items-center justify-between p-3 bg-background-light dark:bg-background-dark rounded-lg border border-border-light dark:border-border-dark">
                            <div>
                                <p class="font-medium">${project.ownerName} (Owner)</p>
                                <p class="text-sm text-subtext-light dark:text-subtext-dark">${projectHubUser.email}</p>
                            </div>
                            <span class="text-sm font-medium text-primary">Leader</span>
                        </div>
                        </div>
                </div>
            </div>
            
             <div class="mt-8 flex justify-between gap-4">
                <button class="flex items-center justify-center gap-2 min-w-[84px] cursor-pointer rounded-xl h-12 px-6 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600" 
                        onclick="showPage('add-project-page')">
                    <span class="material-icons-outlined">arrow_back</span>
                    <span>Back</span>
                </button>
                <button class="flex items-center justify-center gap-2 min-w-[84px] cursor-pointer rounded-xl h-12 px-6 bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90"
                        onclick="showPage('add-project-step3-page'); renderGuideManagementPage('${project._id}');">
                    <span>Next</span>
                    <span class="material-icons-outlined">arrow_forward</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Renders the guide management page (Step 3 of wizard)
 * @param {string} projectId - The ID of the current project.
 */
async function renderGuideManagementPage(projectId) {
     const container = document.getElementById('add-project-step3-page');
    if (!container) return;
    
    // We need to fetch the project again in case team members were added,
    // or just pass the project object if we update it locally.
    // For simplicity, we'll just show the guide request part.
    
    container.innerHTML = `
        <div class="bg-card-light dark:bg-card-dark p-8 rounded-xl shadow-subtle w-full max-w-4xl mx-auto border border-border-light dark:border-border-dark">
            <div class="flex items-center mb-8">
                <div class="flex items-center text-green-500 relative">
                    <div class="rounded-full h-10 w-10 border-2 border-green-500 bg-green-100 flex items-center justify-center">
                        <span class="material-icons-outlined">check</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-green-500">Details</div>
                </div>
                <div class="flex-auto border-t-2 border-green-500"></div>
                <div class="flex items-center text-green-500 relative">
                    <div class="rounded-full h-10 w-10 border-2 border-green-500 bg-green-100 flex items-center justify-center">
                        <span class="material-icons-outlined">check</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-green-500">Team</div>
                </div>
                <div class="flex-auto border-t-2 border-green-500"></div>
                <div class="flex items-center text-primary relative">
                    <div class="rounded-full h-10 w-10 border-2 border-primary bg-primary flex items-center justify-center">
                        <span class="text-white font-bold">3</span>
                    </div>
                    <div class="absolute top-0 -ml-10 text-center mt-12 w-32 text-xs font-medium uppercase text-primary">Guide</div>
                </div>
            </div>
            
            <h3 class="text-lg font-semibold text-text-light dark:text-text-dark mb-4">Guide Assignment</h3>
            <p class="text-sm text-subtext-light dark:text-subtext-dark mb-4">
                Your project is now visible to teachers in your department. They can send you a request to guide your project.
                You can also complete setup now and manage guide requests later from your dashboard.
            </p>
            
            <div id="wizard-guide-requests-container" class="space-y-4">
                <p class="text-subtext-light dark:text-subtext-dark p-4 text-center">No guide requests yet.</p>
            </div>
            
             <div class="mt-8 flex justify-between gap-4">
                <button class="flex items-center justify-center gap-2 min-w-[84px] cursor-pointer rounded-xl h-12 px-6 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600" 
                        onclick="showPage('add-project-step2-page')">
                    <span class="material-icons-outlined">arrow_back</span>
                    <span>Back</span>
                </button>
                <button class="flex items-center justify-center gap-2 min-w-[84px] cursor-pointer rounded-xl h-12 px-6 bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90"
                        onclick="showPage('projects-page');">
                    <span>Finish Setup</span>
                    <span class="material-icons-outlined">done</span>
                </button>
            </div>
        </div>
    `;
    
    // We can also load pending requests for *this specific project*
    // but the current GET /requests/guide loads all for the user.
    // For now, we'll rely on the main dashboard load.
}

async function loadDepartmentStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/students/department`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw await response.json();
        }
        const students = await response.json();
        renderStudentDirectory(students);
    } catch (error) {
        console.error("Error loading department students:", error);
        handleApiError(error, 'student-directory-container');
    }
}

function renderStudentDirectory(students) {
    const container = document.getElementById('student-directory-container');
    if (!container) return;

    if (students.length === 0) {
        container.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark col-span-full text-center">No students found in your department.</p>`;
        return;
    }

    // Update the dynamic student count
    const countHeader = document.getElementById('student-count-header');
    if (countHeader) {
        countHeader.textContent = `Students in Your Department (${students.length})`;
    }

    container.innerHTML = students.map(student => {
        const isGuided = guidedStudentIds.has(student._id);
        
        return `
        <div class="bg-background-light dark:bg-background-dark p-4 rounded-lg flex flex-col items-center text-center shadow-sm border border-border-light dark:border-border-dark relative">
            
            ${isGuided ? `
                <span class="absolute top-2 right-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                    Guiding
                </span>
            ` : ''}

            <img alt="${student.fullName}" class="w-20 h-20 rounded-full mb-4" src="https://ui-avatars.com/api/?name=${encodeURIComponent(student.fullName)}&background=4F46E5&color=fff&bold=true"/>
            <h4 class="font-semibold text-lg text-text-light dark:text-text-dark">${student.fullName}</h4>
            <p class="text-sm text-subtext-light dark:text-subtext-dark mb-6">${student.email}</p>
            
            <div class="flex w-full justify-around mt-auto">
                <button class="p-2 rounded-full hover:bg-primary/10 text-subtext-light dark:text-subtext-dark hover:text-primary" title="Send Message">
                    <span class="material-icons">chat_bubble_outline</span>
                </button>
                <button class="p-2 rounded-full hover:bg-primary/10 text-subtext-light dark:text-subtext-dark hover:text-primary" title="View Profile">
                    <span class="material-icons">visibility</span>
                </button>
                <button class="p-2 rounded-full hover:bg-primary/10 text-subtext-light dark:text-subtext-dark hover:text-primary" title="More Options">
                    <span class="material-icons">more_horiz</span>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

function renderGuidedTeams(projects) {
    const container = document.getElementById('guided-teams-container');
    if (!container) return;

    // Filter for projects this teacher is guiding
    const guidedProjects = projects.filter(p => p.guideId === projectHubUser._id);

    if (guidedProjects.length === 0) {
        container.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark col-span-full">You are not guiding any teams yet.</p>`;
        return;
    }

    container.innerHTML = guidedProjects.map(project => {
        // Create avatar list
        const ownerAvatar = `<div title="${project.ownerName} (Owner)" class="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-card-dark bg-primary text-white text-xs flex items-center justify-center font-semibold">${project.ownerName.charAt(0).toUpperCase()}</div>`;
        const memberAvatars = project.teamMembers.map(member => 
            // We don't have member names here, just IDs. We'll use the ID's first char.
            `<div title="Team Member" class="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-card-dark bg-accent-dark text-white text-xs flex items-center justify-center">${member.userId.charAt(0).toUpperCase()}</div>`
        ).join('');
        
        return `
        <div class="rounded-xl shadow-subtle bg-background-light dark:bg-background-dark p-6 flex flex-col justify-between border border-border-light dark:border-border-dark">
            <div>
                <p class="text-subtext-light dark:text-subtext-dark text-sm font-normal leading-normal">${project.courseCode || 'Project'}</p>
                <p class="text-text-light dark:text-text-dark text-lg font-bold tracking-[-0.015em] mt-1 truncate">${project.name}</p>
                <div class="flex items-center mt-4">
                    <div class="flex -space-x-2">
                        ${ownerAvatar}
                        ${memberAvatars}
                    </div>
                </div>
                <div class="w-full mt-4">
                    <p class="text-xs text-subtext-light dark:text-subtext-dark text-left mb-1">Progress</p>
                    <div class="w-full bg-border-light dark:bg-border-dark rounded-full h-2.5">
                        <div class="bg-blue-500 h-2.5 rounded-full" style="width: ${project.progress}%"></div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between mt-6">
                <button class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors duration-200"
                        onclick="viewProjectDetails('${project._id}')">
                    <span class="truncate">View Project</span>
                </button>
            </div>
        </div>
        `;
    }).join('');
    if (window.smoothScroller) {
        window.smoothScroller.resize();
    }
}

// ============================================
// WIDGET/FORM HANDLERS
// ============================================

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
window.renderTeamManagementPage = renderTeamManagementPage;
window.renderGuideManagementPage = renderGuideManagementPage;
window.loadDepartmentStudents = loadDepartmentStudents;
window.renderStudentDirectory = renderStudentDirectory;
window.renderGuidedTeams = renderGuidedTeams;