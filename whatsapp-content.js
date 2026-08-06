let messageButton = null;

// Create the Paste Message button once.
function createButton() {
  if (!messageButton) {
    messageButton = document.createElement('button');
    messageButton.textContent = 'Paste Message';
    messageButton.className = 'whatsapp-template-button';
    messageButton.style.display = 'none';
    document.body.appendChild(messageButton);
  }
}

// Position the button just above the compose box.
function positionButton(button, inputElement) {
  const rect = inputElement.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;

  button.style.top = `${rect.top + scrollY - 40}px`;
  button.style.left = `${rect.left + scrollX}px`;
}

function hideButton() {
  if (messageButton) messageButton.style.display = 'none';
}

// Read the open chat's title (phone number when no name is saved, name otherwise).
// Read at click time — WhatsApp is an SPA and the rep can switch chats without navigation.
function getChatTitle() {
  const el = document.querySelector('span[data-testid="conversation-info-header-chat-title"]');
  return el ? el.textContent.trim() : '';
}

// Classify the title as a phone number or a name.
// Phone titles are digit-dominant (e.g. "+52 1 55 1384 3021"); names are not.
// NOTE: verify this classifier against real chat titles (incl. a named contact) during live testing.
function classifyTitle(title) {
  if (!title) return { phone: '', name: '' };
  const digits = title.replace(/\D/g, '');
  const isPhone = title.startsWith('+') || (digits.length >= 7 && digits.length >= title.replace(/\s/g, '').length - 3);
  if (isPhone) return { phone: title, name: '' };
  return { phone: '', name: title };
}

// Insert text into WhatsApp's Lexical contenteditable compose box.
// Returns true if the box appears to have received the text.
// NOTE: execCommand('insertText') fires the beforeinput/input events Lexical listens for.
// This is the one technique that needs live verification against WhatsApp Web.
// Trigger the insert. execCommand is deprecated and often returns false even when it
// succeeds, and Lexical commits the text to the DOM asynchronously, so success is not
// judged here — verifyInserted() polls the box afterward.
function triggerInsert(inputElement, text) {
  inputElement.focus();

  // Move caret into the box so insertText targets it.
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(inputElement);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand('insertText', false, text);
}

// True once the box contains the inserted text. Lexical renders newlines as separate
// paragraph nodes, so textContent drops line breaks — compare with whitespace stripped
// so multi-line templates still register.
function verifyInserted(inputElement, text) {
  const strip = function(s) { return s.replace(/\s/g, ''); };
  return strip(inputElement.textContent).includes(strip(text));
}

function showFeedback(message) {
  if (!messageButton) return;
  messageButton.disabled = false;
  messageButton.textContent = message;
  setTimeout(function() {
    messageButton.textContent = 'Paste Message';
    hideButton();
  }, 1500);
}

// Handle a click on the Paste Message button.
function onPasteClick(inputElement) {
  chrome.storage.local.get({ whatsappTemplates: [] }, function(result) {
    const templates = result.whatsappTemplates;
    const active = templates.find(function(t) { return t.active; });

    if (!active || !active.message) {
      showFeedback('No active template');
      return;
    }

    // Disable during the async poll window so a double-click can't paste twice.
    messageButton.disabled = true;
    triggerInsert(inputElement, active.message);

    // Lexical commits to the DOM asynchronously; poll until the text appears.
    const start = Date.now();
    const interval = setInterval(function() {
      if (verifyInserted(inputElement, active.message)) {
        clearInterval(interval);
        recordTouchpoint(active.message);
      } else if (Date.now() - start >= 300) {
        clearInterval(interval);
        showFeedback('Paste failed');
      }
    }, 20);
  });
}

// Capture the recipient and record the touchpoint — only after a confirmed insert.
function recordTouchpoint(message) {
  const { phone, name } = classifyTitle(getChatTitle());

  chrome.runtime.sendMessage({
    action: 'recordWhatsAppTouchpoint',
    phone: phone,
    name: name,
    message: message
  }, function(response) {
    if (response && response.recorded) {
      showFeedback('Message pasted');
    } else {
      showFeedback('Pasted (recipient unknown)');
    }
  });
}

// Show the button when the compose box gains focus.
function initializeButton(inputElement) {
  createButton();
  positionButton(messageButton, inputElement);
  messageButton.style.display = 'block';
  messageButton.onclick = function() { onPasteClick(inputElement); };
}

function observeInputs() {
  createButton();

  document.addEventListener('focus', function(e) {
    const target = e.target;
    if (target.getAttribute && target.getAttribute('data-testid') === 'conversation-compose-box-input') {
      initializeButton(target);
    }
  }, true);

  document.addEventListener('blur', function(e) {
    setTimeout(hideButton, 20000);
  }, true);
}

// ========== SFDC HANDOFF ==========

let sfdcButton = null;
let sfdcConfirm = null;
let sfdcResetButton = null;

function createSfdcButton() {
  if (sfdcButton) return;

  sfdcButton = document.createElement('button');
  sfdcButton.className = 'whatsapp-sfdc-btn';
  sfdcButton.style.display = 'none';
  sfdcButton.addEventListener('click', onSfdcClick);
  document.body.appendChild(sfdcButton);

  sfdcConfirm = document.createElement('div');
  sfdcConfirm.className = 'whatsapp-sfdc-confirm';
  sfdcConfirm.style.display = 'none';
  document.body.appendChild(sfdcConfirm);

  sfdcResetButton = document.createElement('button');
  sfdcResetButton.className = 'whatsapp-reset-btn';
  sfdcResetButton.textContent = 'Reset';
  sfdcResetButton.style.display = 'none';
  sfdcResetButton.addEventListener('click', function() {
    chrome.storage.local.set({ whatsappTouchpoints: [] });
  });
  document.body.appendChild(sfdcResetButton);
}

// Single update path for the button's label and visibility. Driven by the storage
// listener below, so recording a touchpoint, a popup Reset, and an on-page Reset
// all keep the button in sync without extra storage reads.
function refreshSfdcButton(count) {
  createSfdcButton();
  if (count > 0) {
    sfdcButton.textContent = 'Send to SFDC via Quicksuite (' + count + ')';
    sfdcButton.style.display = 'block';
  } else {
    sfdcButton.style.display = 'none';
    sfdcConfirm.style.display = 'none';
    sfdcResetButton.style.display = 'none';
  }
}

function onSfdcClick() {
  chrome.storage.local.get({ whatsappTouchpoints: [] }, function(result) {
    const touchpoints = result.whatsappTouchpoints;
    if (!touchpoints.length) return;

    navigator.clipboard.writeText(buildSfdcPrompt(touchpoints)).then(function() {
      const label = sfdcButton.textContent;
      sfdcButton.textContent = 'Copied!';
      setTimeout(function() { sfdcButton.textContent = label; }, 1500);

      sfdcConfirm.textContent = '✓ Copied! Open Quicksuite, paste, and press Enter.';
      sfdcConfirm.style.display = 'block';
      setTimeout(function() { sfdcConfirm.style.display = 'none'; }, 4000);

      sfdcResetButton.style.display = 'block';
    }).catch(function() {
      alert('Failed to copy to clipboard. Please try again.');
    });
  });
}

function buildSfdcPrompt(touchpoints) {
  const json = JSON.stringify(touchpoints, null, 2);
  return [
    'Log the following WhatsApp interactions into Salesforce as completed Activities',
    'on existing Contacts.',
    '',
    'Rules:',
    '1. Only use field values from the JSON below. Never infer or guess.',
    '2. For each interaction:',
    '   a. If a phone is present, find the Contact by phone: strip all non-digit',
    '      characters from both the interaction phone and each candidate Contact',
    '      phone field, and compare on the trailing significant digits. Use a',
    '      Contact only if EXACTLY ONE matches.',
    '   b. If a name is present instead of a phone (no phone provided), search',
    '      Contacts by name. Use a Contact only if exactly one clear match exists.',
    '   c. If zero matches, or more than one match, skip and list under',
    '      "Unmatched / ambiguous" — do not guess and do not create a Contact.',
    '3. Never create a Contact. These are all existing Contacts. If none matches,',
    '   the interaction is skipped.',
    '4. For each matched Contact, run create_standard_task (or log an Activity) with:',
    '   - subject: "Sent WhatsApp message via NavAssist"',
    '   - description: the value of "message" for that interaction',
    '   - whoId: the matched Contact ID',
    '   - activityDate: the value of "date" for that interaction',
    '   - status: "Completed"',
    '   - type: "Other"',
    '5. Process sequentially. If three consecutive interactions fail for the same',
    '   reason, stop and report.',
    '',
    'After completion, output:',
    '- Logged: count and list of (phone/name, contact ID)',
    '- Unmatched / ambiguous: count and list of (phone/name)',
    '- Errors: count and list of (phone/name, error)',
    '',
    'Interactions:',
    json
  ].join('\n');
}

chrome.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local' && changes.whatsappTouchpoints) {
    refreshSfdcButton((changes.whatsappTouchpoints.newValue || []).length);
  }
});

chrome.storage.local.get({ whatsappTouchpoints: [] }, function(result) {
  refreshSfdcButton(result.whatsappTouchpoints.length);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeInputs);
} else {
  observeInputs();
}
