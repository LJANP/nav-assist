let messageButton = null;
let subjectButton = null;

// Create buttons
function createButtons() {
  if (!messageButton) {
    messageButton = document.createElement('button');
    messageButton.textContent = 'Paste Message';
    messageButton.className = 'linkedin-template-button';
    messageButton.style.display = 'none';
    document.body.appendChild(messageButton);
  }

  if (!subjectButton) {
    subjectButton = document.createElement('button');
    subjectButton.textContent = 'Paste Subject';
    subjectButton.className = 'linkedin-template-button linkedin-subject-button';
    subjectButton.style.display = 'none';
    document.body.appendChild(subjectButton);
  }
}

// Position button near input field
function positionButton(button, inputElement) {
  const rect = inputElement.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;

  button.style.top = `${rect.top + scrollY - 40}px`;
  button.style.left = `${rect.left + scrollX}px`;
}

// Hide buttons
function hideButtons() {
  if (messageButton) messageButton.style.display = 'none';
  if (subjectButton) subjectButton.style.display = 'none';
}

// Get recipient's full name from the messaging window
function getRecipientFullName() {
  // Try the regular message overlay
  const nameElement = document.querySelector('span[data-anonymize="person-name"]._name_1sdjqx');
  if (nameElement) {
    const fullName = nameElement.textContent.trim();
    if (fullName) return fullName;
  }

  // Try the connection invitation modal
  const connectNameElement = document.querySelector('div.artdeco-entity-lockup__title[data-anonymize="person-name"]');
  if (connectNameElement) {
    const fullName = connectNameElement.textContent.trim();
    if (fullName) return fullName;
  }

  return '';
}

function getRecipientName() {
  const fullName = getRecipientFullName();
  if (fullName) return fullName.split(' ')[0];
  return 'there';
}

// Find the matching profile card or table row by recipient name and extract fields
function getRecipientDetails() {
  const fullName = getRecipientFullName();
  if (!fullName) return { title: '', location: '', tenure: '' };

  const firstName = fullName.split(' ')[0];
  const lastName = fullName.split(' ').slice(1).join(' ');

  // Try search page — profile cards in artdeco list
  const profileCards = document.querySelectorAll('ol.artdeco-list li.artdeco-list__item');
  for (const card of profileCards) {
    const nameEl = card.querySelector('a.list-detail__view-profile-link, div.artdeco-entity-lockup__title a');
    if (!nameEl) continue;
    const cardName = nameEl.textContent.trim();
    if (!nameMatches(cardName, firstName, lastName)) continue;

    const titleEl = card.querySelector('span[data-anonymize="title"]');
    const locationEl = card.querySelector('div.artdeco-entity-lockup__caption');

    let tenure = '';
    const tenurePatterns = [
      /(\d+\s+years?\s+\d+\s+months?)\s+in\s+role/,
      /(\d+\s+years?\s+\d+\s+months?)\s+in\s+company/,
      /(\d+\s+years?\s+\d+\s+months?)/,
      /(\d+\s+months?)\s+in\s+role/,
      /(\d+\s+years?)\s+in\s+role/
    ];
    const cardText = card.textContent;
    for (const pattern of tenurePatterns) {
      const match = cardText.match(pattern);
      if (match && match[1]) { tenure = match[1].trim(); break; }
    }

    return {
      title: titleEl ? titleEl.textContent.trim() : '',
      location: locationEl ? locationEl.textContent.trim() : '',
      tenure: tenure
    };
  }

  // Try leads page — table rows
  const leadRows = document.querySelectorAll('tbody tr');
  for (const row of leadRows) {
    let nameEl = row.querySelector('a[href*="/lead/"] span:first-child');
    if (!nameEl) nameEl = row.querySelector('a[href*="/people/"] span:first-child');
    if (!nameEl) continue;
    const rowName = nameEl.textContent.trim();
    if (!nameMatches(rowName, firstName, lastName)) continue;

    const titleEl = row.querySelector('div[data-anonymize="job-title"]');
    let location = '';
    const cells = row.querySelectorAll('td');
    if (cells.length >= 3) location = cells[2].textContent.trim();

    return {
      title: titleEl ? titleEl.textContent.trim() : '',
      location: location,
      tenure: ''
    };
  }

  return { title: '', location: '', tenure: '' };
}

function nameMatches(cardName, firstName, lastName) {
  const clean = cardName.replace(/\s+/g, ' ').trim();
  if (!lastName) return clean.startsWith(firstName);
  return clean.startsWith(firstName) && clean.includes(lastName);
}

// Insert template
function insertTemplate(inputElement, templateType) {
  chrome.storage.local.get([templateType], function(result) {
    if (result[templateType]) {
      const recipientName = getRecipientName();
      const details = getRecipientDetails();
      const personalizedMessage = result[templateType]
        .replace(/{name}/g, recipientName)
        .replace(/{title}/g, details.title)
        .replace(/{location}/g, details.location)
        .replace(/{tenure}/g, details.tenure);
      inputElement.value = personalizedMessage;

      // Trigger input event
      const event = new Event('input', { bubbles: true });
      inputElement.dispatchEvent(event);

      hideButtons();
    }
  });
}

// Initialize buttons
function initializeButtons(inputElement) {
  createButtons();

  // Determine if this is a subject or message field
  const isSubjectField = inputElement.getAttribute('aria-label')?.includes('subject') ||
                        inputElement.placeholder?.toLowerCase().includes('subject');

  if (isSubjectField) {
    if (!inputElement.value.trim()) {
      positionButton(subjectButton, inputElement);
      subjectButton.style.display = 'block';
      messageButton.style.display = 'none';

      subjectButton.onclick = () => insertTemplate(inputElement, 'subjectTemplate');
    }
  } else {
    if (!inputElement.value.trim()) {
      positionButton(messageButton, inputElement);
      messageButton.style.display = 'block';
      subjectButton.style.display = 'none';

      messageButton.onclick = () => insertTemplate(inputElement, 'messageTemplate');
    }
  }
}

// Monitor for input fields
function observeInputs() {
  createButtons();

  document.addEventListener('focus', function(e) {
    const target = e.target;

    if (target.tagName === 'TEXTAREA' ||
        (target.tagName === 'INPUT' && target.type === 'text') ||
        target.getAttribute('role') === 'textbox' ||
        target.classList.contains('msg-form__textbox') ||
        target.classList.contains('ember-text-area')) {

      initializeButtons(target);
    }
  }, true);

  document.addEventListener('blur', function(e) {
    setTimeout(hideButtons, 20000);
  }, true);
}

// Start observing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeInputs);
} else {
  observeInputs();
}
