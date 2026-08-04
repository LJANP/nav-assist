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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeInputs);
} else {
  observeInputs();
}
