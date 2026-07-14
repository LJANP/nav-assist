let hasSentMessageCache = false;

document.addEventListener('DOMContentLoaded', function() {

    // ========== TABS ==========

    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    // ========== EXPORT TAB: FILTER SETTINGS ==========

    // Load saved settings
    chrome.storage.sync.get({
        includeFullName: true,
        includeFirstName: false,
        includeLastName: false,
        includeCompany: true,
        includeTitle: true,
        includeTenure: true,
        includeLocation: true,
        includeStatus: true,
        exportAsCSV: false
    }, function(items) {
        document.getElementById('includeFullName').checked = items.includeFullName;
        document.getElementById('includeFirstName').checked = items.includeFirstName;
        document.getElementById('includeLastName').checked = items.includeLastName;
        document.getElementById('includeCompany').checked = items.includeCompany;
        document.getElementById('includeTitle').checked = items.includeTitle;
        document.getElementById('includeTenure').checked = items.includeTenure;
        document.getElementById('includeLocation').checked = items.includeLocation;
        document.getElementById('includeStatus').checked = items.includeStatus;
        updateHeadersDisplay(items);
    });

    // Chevron toggle for name sub-options
    document.getElementById('fullNameRow').addEventListener('click', function(e) {
        if (e.target.closest('.toggle-switch')) return;
        const sub = document.getElementById('nameSubToggles');
        const chevron = document.getElementById('nameChevron');
        const isOpen = sub.style.display !== 'none';
        sub.style.display = isOpen ? 'none' : 'block';
        chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
    });

    // Save settings when button is clicked
    document.getElementById('saveFilters').addEventListener('click', function() {
        const settings = {
            includeFullName: document.getElementById('includeFullName').checked,
            includeFirstName: document.getElementById('includeFirstName').checked,
            includeLastName: document.getElementById('includeLastName').checked,
            includeCompany: document.getElementById('includeCompany').checked,
            includeTitle: document.getElementById('includeTitle').checked,
            includeTenure: document.getElementById('includeTenure').checked,
            includeLocation: document.getElementById('includeLocation').checked,
            includeStatus: document.getElementById('includeStatus').checked
        };

        chrome.storage.sync.set(settings, function() {
            const button = document.getElementById('saveFilters');
            button.textContent = 'Saved!';
            button.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
                button.textContent = 'Save Settings';
                button.style.backgroundColor = '';
            }, 1500);
            updateHeadersDisplay(settings);
        });
    });

    // Update headers display on toggle change
    ['includeFullName', 'includeFirstName', 'includeLastName', 'includeCompany', 'includeTitle', 'includeTenure', 'includeLocation', 'includeStatus'].forEach(id => {
        document.getElementById(id).addEventListener('change', function() {
            updateHeadersDisplay({
                includeFullName: document.getElementById('includeFullName').checked,
                includeFirstName: document.getElementById('includeFirstName').checked,
                includeLastName: document.getElementById('includeLastName').checked,
                includeCompany: document.getElementById('includeCompany').checked,
                includeTitle: document.getElementById('includeTitle').checked,
                includeTenure: document.getElementById('includeTenure').checked,
                includeLocation: document.getElementById('includeLocation').checked,
                includeStatus: document.getElementById('includeStatus').checked
            });
        });
    });

    // Copy headers button
    document.getElementById('copyHeaders').addEventListener('click', function() {
        const headers = getSelectedHeaders();
        navigator.clipboard.writeText(headers.join('\t')).then(() => {
            const button = this;
            button.textContent = 'Copied!';
            button.style.backgroundColor = '#2e7d32';
            setTimeout(() => {
                button.textContent = 'Copy Headers';
                button.style.backgroundColor = '';
            }, 1500);
        });
    });

    // ========== EXPORT TAB: CAPTURED DATA ==========

    // Load captured count on popup open
    loadCapturedCount();

    // Reset captured data
    document.getElementById('resetBtn').addEventListener('click', function() {
        chrome.storage.local.set({ sessionData: [], capturedUrls: [], sentMessages: {} }, function() {
            loadCapturedCount();
        });
    });

    // ========== MESSAGING TAB: TEMPLATES ==========

    loadTemplates();

    document.getElementById('addTemplateBtn').addEventListener('click', function() {
        chrome.storage.local.get({ messageTemplates: [] }, function(result) {
            var templates = result.messageTemplates;
            var newTemplate = {
                id: 't_' + Date.now(),
                name: 'New Template',
                subject: '',
                message: '',
                campaign: '',
                active: templates.length === 0
            };
            templates.push(newTemplate);
            chrome.storage.local.set({ messageTemplates: templates }, function() {
                renderTemplates(templates, newTemplate.id);
            });
        });
    });

}); // end DOMContentLoaded

// ========== HELPER FUNCTIONS ==========

function getSelectedHeaders() {
    const headers = [];
    if (document.getElementById('includeFullName').checked) headers.push('Full Name');
    if (document.getElementById('includeFirstName').checked) headers.push('First Name');
    if (document.getElementById('includeLastName').checked) headers.push('Last Name');
    if (document.getElementById('includeCompany').checked) headers.push('Company');
    if (document.getElementById('includeTitle').checked) headers.push('Title');
    if (document.getElementById('includeTenure').checked) headers.push('Tenure');
    if (document.getElementById('includeLocation').checked) headers.push('Location');
    if (document.getElementById('includeStatus').checked) headers.push('Status');
    if (hasSentMessageCache) {
        headers.push('Sent Date');
        headers.push('Sent Message');
    }
    return headers;
}

function updateHeadersDisplay(settings) {
    chrome.storage.local.get({ sessionData: [], sentMessages: {} }, function(result) {
        const sent = result.sentMessages;
        hasSentMessageCache = result.sessionData.some(function(p) {
            return sent[(p.fullName || '').trim().toLowerCase()];
        });
        const headers = [];
        if (settings.includeFullName) headers.push('Full Name');
        if (settings.includeFirstName) headers.push('First Name');
        if (settings.includeLastName) headers.push('Last Name');
        if (settings.includeCompany) headers.push('Company');
        if (settings.includeTitle) headers.push('Title');
        if (settings.includeTenure) headers.push('Tenure');
        if (settings.includeLocation) headers.push('Location');
        if (settings.includeStatus) headers.push('Status');
        if (hasSentMessageCache) {
            headers.push('Sent Date');
            headers.push('Sent Message');
        }
        document.getElementById('headersText').textContent = headers.join('  |  ');
    });
}

function loadCapturedCount() {
    chrome.storage.local.get({ sessionData: [] }, function(result) {
        document.getElementById('capturedCount').textContent = result.sessionData.length;
    });
}

// ========== TEMPLATE LIBRARY ==========

function loadTemplates() {
    chrome.storage.local.get({ messageTemplates: null, subjectTemplate: null, messageTemplate: null }, function(result) {
        if (result.messageTemplates) {
            renderTemplates(result.messageTemplates);
            return;
        }
        // Migrate old format
        if (result.subjectTemplate || result.messageTemplate) {
            var migrated = [{
                id: 't_' + Date.now(),
                name: 'My Template',
                subject: result.subjectTemplate || '',
                message: result.messageTemplate || '',
                active: true
            }];
            chrome.storage.local.set({ messageTemplates: migrated }, function() {
                chrome.storage.local.remove(['subjectTemplate', 'messageTemplate']);
                renderTemplates(migrated);
            });
        } else {
            renderTemplates([]);
        }
    });
}

function renderTemplates(templates, expandId) {
    var list = document.getElementById('templateList');
    list.innerHTML = '';

    if (!templates.length) {
        list.innerHTML = '<div class="empty-state">No templates yet</div>';
        return;
    }

    templates.forEach(function(tmpl) {
        var item = document.createElement('div');
        item.className = 'template-item';

        // Header
        var header = document.createElement('div');
        header.className = 'template-item-header';

        var chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.innerHTML = '&#9654;';

        var name = document.createElement('span');
        name.className = 'template-name';
        name.textContent = tmpl.name;

        var dot = document.createElement('div');
        dot.className = 'active-dot' + (tmpl.active ? ' is-active' : '');
        dot.title = tmpl.active ? 'Active template' : 'Set as active';

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&#128465;';
        deleteBtn.title = 'Delete';

        header.appendChild(chevron);
        header.appendChild(name);
        header.appendChild(dot);
        header.appendChild(deleteBtn);

        // Body
        var body = document.createElement('div');
        body.className = 'template-item-body';

        body.innerHTML =
            '<input class="template-name-input" placeholder="Template name" value="' + escapeAttr(tmpl.name) + '">' +
            '<div class="template-group"><div class="template-label">Subject</div>' +
            '<textarea class="template-textarea subject" placeholder="Quick question for {name}">' + escapeHtml(tmpl.subject) + '</textarea></div>' +
            '<div class="template-group"><div class="template-label">Message</div>' +
            '<textarea class="template-textarea message" placeholder="Hey {name}, thanks for connecting!">' + escapeHtml(tmpl.message) + '</textarea></div>' +
            '<div class="template-group"><div class="template-label">Campaign Tag (optional)</div>' +
            '<input class="template-campaign-input" placeholder="Campaign name / tag" value="' + escapeAttr(tmpl.campaign) + '"></div>' +
            '<button class="template-save-btn">Save</button>';

        item.appendChild(header);
        item.appendChild(body);
        list.appendChild(item);

        // Expand if requested
        if (expandId === tmpl.id) {
            body.classList.add('expanded');
            chevron.style.transform = 'rotate(90deg)';
        }

        // Toggle expand/collapse
        chevron.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleBody(body, chevron);
        });
        name.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleBody(body, chevron);
        });

        // Set active
        dot.addEventListener('click', function(e) {
            e.stopPropagation();
            setActiveTemplate(tmpl.id);
        });

        // Delete
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteTemplate(tmpl.id);
        });

        // Save
        body.querySelector('.template-save-btn').addEventListener('click', function() {
            saveTemplate(tmpl.id, {
                name: body.querySelector('.template-name-input').value.trim() || 'Untitled',
                subject: body.querySelector('.template-textarea.subject').value,
                message: body.querySelector('.template-textarea.message').value,
                campaign: body.querySelector('.template-campaign-input').value.trim()
            });
        });
    });
}

function toggleBody(body, chevron) {
    var isOpen = body.classList.contains('expanded');
    // Collapse all
    document.querySelectorAll('.template-item-body').forEach(function(b) { b.classList.remove('expanded'); });
    document.querySelectorAll('.template-item-header .chevron').forEach(function(c) { c.style.transform = ''; });
    if (!isOpen) {
        body.classList.add('expanded');
        chevron.style.transform = 'rotate(90deg)';
    }
}

function setActiveTemplate(id) {
    chrome.storage.local.get({ messageTemplates: [] }, function(result) {
        var templates = result.messageTemplates;
        templates.forEach(function(t) { t.active = t.id === id; });
        chrome.storage.local.set({ messageTemplates: templates }, function() {
            renderTemplates(templates);
        });
    });
}

function deleteTemplate(id) {
    chrome.storage.local.get({ messageTemplates: [] }, function(result) {
        var templates = result.messageTemplates;
        if (templates.length === 1 && !confirm('Delete your last template?')) return;
        var wasActive = templates.find(function(t) { return t.id === id; });
        templates = templates.filter(function(t) { return t.id !== id; });
        // Auto-promote if deleted was active
        if (wasActive && wasActive.active && templates.length > 0) {
            templates[0].active = true;
        }
        chrome.storage.local.set({ messageTemplates: templates }, function() {
            renderTemplates(templates);
        });
    });
}

function saveTemplate(id, updates) {
    chrome.storage.local.get({ messageTemplates: [] }, function(result) {
        var templates = result.messageTemplates;
        var tmpl = templates.find(function(t) { return t.id === id; });
        if (tmpl) {
            tmpl.name = updates.name;
            tmpl.subject = updates.subject;
            tmpl.message = updates.message;
            tmpl.campaign = updates.campaign;
        }
        chrome.storage.local.set({ messageTemplates: templates }, function() {
            renderTemplates(templates);
        });
    });
}

function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
